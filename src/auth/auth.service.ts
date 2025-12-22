import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as openidClient from 'openid-client';
import { UsersService } from '../users/users.service';
import { getSecret } from '../utils/secrets';

export interface OidcUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  preferred_username?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  name?: string;
}

export interface RegisterUserDto {
  email: string;
  password: string;
  name?: string;
}

// Default admin credentials (can be overridden via env vars)
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_EMAIL = 'admin@localhost';
const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private oidcConfig: openidClient.Configuration | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    // Create default admin user if local auth is enabled
    if (this.isLocalAuthEnabled()) {
      await this.ensureDefaultAdminExists();
    }

    await this.ensureSuperAdmins();
  }

  /**
   * Ensure default admin user exists in database
   */
  private async ensureDefaultAdminExists() {
    const adminEmail = getSecret('ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL);
    const adminPassword = getSecret('ADMIN_PASSWORD', 'admin');

    const existingAdmin = await this.usersService.findByEmail(adminEmail);

    if (!existingAdmin) {
      // Create admin with bcrypt-hashed password
      const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_SALT_ROUNDS);
      await this.usersService.createLocalUser({
        email: adminEmail,
        passwordHash,
        name: 'Administrator',
      });
      this.logger.log(`Default admin user created: ${adminEmail}`);
    } else if (!existingAdmin.passwordHash) {
      // Migrate existing admin user to bcrypt
      const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_SALT_ROUNDS);
      await this.usersService.updatePasswordHash(
        existingAdmin.id,
        passwordHash,
      );
      this.logger.log(`Admin user migrated to bcrypt: ${adminEmail}`);
    }
  }

  /**
   * Promote configured users to super admin role
   */
  private async ensureSuperAdmins() {
    const superAdminEnv = getSecret('SUPERADMIN_EMAILS');
    if (!superAdminEnv) {
      return;
    }

    const emails = superAdminEnv
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    for (const email of emails) {
      await this.usersService.promoteSuperAdminByEmail(email);
    }
  }

  /**
   * Get OIDC configuration with support for Docker internal networking.
   *
   * When OIDC_INTERNAL_URL is set, this method:
   * 1. Fetches discovery metadata from the internal URL
   * 2. Rewrites token_endpoint, userinfo_endpoint, jwks_uri to use internal URLs
   * 3. Keeps authorization_endpoint as external (browser needs to reach it)
   *
   * This allows the API container to communicate with the OIDC provider
   * using Docker internal networking while the browser uses external URLs.
   */
  /**
   * Normalize URL by removing trailing slash for consistent comparison/replacement.
   */
  private normalizeUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private async getOidcConfig(): Promise<openidClient.Configuration> {
    if (this.oidcConfig) {
      return this.oidcConfig;
    }

    const clientId = getSecret('OIDC_CLIENT_ID');
    const clientSecret = getSecret('OIDC_CLIENT_SECRET');

    // Normalize URLs to remove trailing slashes for consistent comparison
    const issuerUrl = this.normalizeUrl(getSecret('OIDC_ISSUER_URL') || '');
    // Use internal URL for discovery AND token exchange if provided (e.g., http://dex:5556/dex for Docker)
    const internalUrl = this.normalizeUrl(
      getSecret('OIDC_INTERNAL_URL') || issuerUrl,
    );

    if (!issuerUrl || !clientId || !clientSecret) {
      throw new Error('OIDC configuration missing');
    }

    this.logger.log(
      `Discovering OIDC provider at ${internalUrl} (issuer: ${issuerUrl})`,
    );

    try {
      // Manually fetch discovery metadata and rewrite URLs for Docker internal networking
      // This is necessary because the OIDC server returns external URLs (e.g., https://draw.example.com/dex/token)
      // but the API container needs to use internal URLs (e.g., http://dex:5556/dex/token)
      const discoveryUrl = internalUrl + '/.well-known/openid-configuration';

      // Fetch the discovery document manually
      const discoveryResponse = await fetch(discoveryUrl);
      if (!discoveryResponse.ok) {
        throw new Error(
          `Discovery request failed: ${discoveryResponse.status}`,
        );
      }
      const metadata = await discoveryResponse.json();

      // Rewrite endpoints to use internal URLs for Docker networking
      // The external URL (issuerUrl) is used by the browser, internal URL is used by the API container
      if (internalUrl !== issuerUrl) {
        const rewriteUrl = (url: string | undefined): string | undefined => {
          if (!url) return url;
          // Normalize the URL from metadata before replacement
          const normalizedUrl = this.normalizeUrl(url);
          // Replace the external issuer URL prefix with the internal URL prefix
          return normalizedUrl.replace(issuerUrl, internalUrl);
        };

        metadata.token_endpoint = rewriteUrl(metadata.token_endpoint);
        metadata.userinfo_endpoint = rewriteUrl(metadata.userinfo_endpoint);
        metadata.jwks_uri = rewriteUrl(metadata.jwks_uri);
        // Keep authorization_endpoint as external URL - browser needs to reach it
        // metadata.authorization_endpoint stays unchanged

        this.logger.log(
          `Rewrote OIDC endpoints for internal networking: token=${metadata.token_endpoint}`,
        );
      }

      // Create Configuration using the constructor with modified metadata
      // This bypasses discovery and uses our rewritten endpoints
      this.oidcConfig = new openidClient.Configuration(
        metadata,
        clientId,
        undefined, // clientMetadata
        openidClient.ClientSecretPost(clientSecret),
      );

      // Allow insecure requests for internal Docker networking (http://)
      openidClient.allowInsecureRequests(this.oidcConfig);
    } catch (discoveryError) {
      this.logger.error(`OIDC discovery failed: ${discoveryError}`);
      throw discoveryError;
    }

    return this.oidcConfig;
  }

  isOidcConfigured(): boolean {
    return !!(
      getSecret('OIDC_ISSUER_URL') &&
      getSecret('OIDC_CLIENT_ID') &&
      getSecret('OIDC_CLIENT_SECRET')
    );
  }

  /**
   * Check if local authentication is enabled (default: true when OIDC not configured)
   */
  isLocalAuthEnabled(): boolean {
    // Local auth is enabled if OIDC is not configured, or explicitly enabled
    const enableLocalAuth = getSecret('ENABLE_LOCAL_AUTH');
    const explicitlyEnabled = enableLocalAuth === 'true';
    const explicitlyDisabled = enableLocalAuth === 'false';

    if (explicitlyDisabled) {
      return false;
    }

    return explicitlyEnabled || !this.isOidcConfigured();
  }

  /**
   * Check if user registration is enabled
   */
  isRegistrationEnabled(): boolean {
    // Registration is disabled by default, must be explicitly enabled
    return getSecret('ENABLE_REGISTRATION') === 'true';
  }

  /**
   * Register a new user with email and password
   */
  async registerUser(
    dto: RegisterUserDto,
  ): Promise<{ accessToken: string; user: any }> {
    if (!this.isLocalAuthEnabled()) {
      throw new BadRequestException('Local authentication is disabled');
    }

    if (!this.isRegistrationEnabled()) {
      throw new BadRequestException('User registration is disabled');
    }

    const { email, password, name } = dto;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Validate password length
    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Create user
    const user = await this.usersService.createLocalUser({
      email,
      passwordHash,
      name: name || email.split('@')[0], // Use email prefix as default name
    });

    this.logger.log(`New user registered: ${user.email}`);

    // Generate JWT
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    const accessToken = this.jwtService.sign(payload);

    return { accessToken, user };
  }

  /**
   * Authenticate with email/password (supports both admin and registered users)
   */
  async authenticateLocal(
    emailOrUsername: string,
    password: string,
  ): Promise<{ accessToken: string; user: any }> {
    if (!this.isLocalAuthEnabled()) {
      throw new UnauthorizedException('Local authentication is disabled');
    }

    // Support both email and username for admin
    const adminUsername = getSecret('ADMIN_USERNAME', DEFAULT_ADMIN_USERNAME);
    const adminEmail = getSecret('ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL);

    // Determine email to look up
    let email = emailOrUsername;
    if (emailOrUsername === adminUsername) {
      email = adminEmail;
    }

    // Find user by email
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      this.logger.warn(`Failed login attempt for user: ${emailOrUsername}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if user has a password hash
    if (!user.passwordHash) {
      // OIDC-only user trying to use password login
      this.logger.warn(`Password login attempted for OIDC-only user: ${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      this.logger.warn(`Failed login attempt for user: ${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logger.log(`User authenticated: ${user.email}`);

    // Ensure user has at least one workspace (for existing users without workspace)
    await this.usersService.ensureUserHasWorkspace(user.id, user.email);

    // Generate JWT
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    const accessToken = this.jwtService.sign(payload);

    return { accessToken, user };
  }

  /**
   * Build the authorization URL for OIDC login.
   * Uses PKCE for security.
   */
  async getAuthorizationUrl(state: string): Promise<string> {
    const config = await this.getOidcConfig();
    // Build callback URL from APP_URL if not explicitly set
    const appUrl = getSecret('APP_URL', 'http://localhost');
    const oidcCallbackUrl = getSecret('OIDC_CALLBACK_URL');
    const callbackUrl = oidcCallbackUrl || `${appUrl}/api/v2/auth/callback`;

    if (!callbackUrl) {
      throw new Error('OIDC_CALLBACK_URL not configured');
    }

    const codeVerifier = openidClient.randomPKCECodeVerifier();
    const codeChallenge =
      await openidClient.calculatePKCECodeChallenge(codeVerifier);

    // Store code verifier in state (encoded)
    const stateData = JSON.stringify({ state, codeVerifier });
    const encodedState = Buffer.from(stateData).toString('base64url');

    // Manually construct the authorization URL
    // Note: buildAuthorizationUrl from openid-client v6 has issues with some configurations,
    // so we construct the URL manually for reliability
    const serverMeta = config.serverMetadata();
    const clientMeta = config.clientMetadata();

    const authorizationEndpoint = serverMeta.authorization_endpoint;
    const clientId = clientMeta.client_id;

    if (!authorizationEndpoint) {
      throw new Error('Authorization endpoint not found in server metadata');
    }

    const authUrl = new URL(authorizationEndpoint);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', encodedState);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return authUrl.href;
  }

  /**
   * Handle the OIDC callback after user authentication.
   * Exchanges the authorization code for tokens and creates/updates the user.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ accessToken: string; user: any }> {
    const config = await this.getOidcConfig();
    // Build callback URL from APP_URL if not explicitly set
    const callbackUrl =
      getSecret('OIDC_CALLBACK_URL') ||
      `${getSecret('APP_URL', 'http://localhost')}/api/v2/auth/callback`;

    if (!callbackUrl) {
      throw new Error('OIDC_CALLBACK_URL not configured');
    }

    // Decode state to get code verifier
    let codeVerifier: string;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      codeVerifier = stateData.codeVerifier;
    } catch {
      throw new UnauthorizedException('Invalid state parameter');
    }

    // Build the full callback URL with query parameters as openid-client expects
    // openid-client v6 requires BOTH state in URL AND expectedState in checks
    const fullCallbackUrl = new URL(callbackUrl);
    fullCallbackUrl.searchParams.set('code', code);
    fullCallbackUrl.searchParams.set('state', state);

    // Exchange code for tokens
    const tokens = await openidClient.authorizationCodeGrant(
      config,
      fullCallbackUrl,
      {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
      },
    );

    // Get user info
    const userInfo = (await openidClient.fetchUserInfo(
      config,
      tokens.access_token,
      tokens.claims()?.sub,
    )) as OidcUserInfo;

    this.logger.log(`User authenticated: ${userInfo.email}`);

    // Create or update user in database
    const user = await this.usersService.upsertFromOidc({
      oidcId: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name || userInfo.preferred_username,
      avatarUrl: userInfo.picture,
    });

    // Generate JWT
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    const accessToken = this.jwtService.sign(payload);

    return { accessToken, user };
  }

  async validateJwtPayload(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}
