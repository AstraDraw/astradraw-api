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

  private async getOidcConfig(): Promise<openidClient.Configuration> {
    if (this.oidcConfig) {
      return this.oidcConfig;
    }

    const issuerUrl = getSecret('OIDC_ISSUER_URL');
    const clientId = getSecret('OIDC_CLIENT_ID');
    const clientSecret = getSecret('OIDC_CLIENT_SECRET');
    // Use internal URL for discovery if provided (e.g., http://dex:5556/dex for Docker)
    const internalUrl = getSecret('OIDC_INTERNAL_URL') || issuerUrl;

    if (!issuerUrl || !clientId || !clientSecret) {
      throw new Error('OIDC configuration missing');
    }

    this.logger.log(
      `Discovering OIDC provider at ${internalUrl} (issuer: ${issuerUrl})`,
    );

    // Discover using internal URL but expect issuer to match the public URL
    this.oidcConfig = await openidClient.discovery(
      new URL(internalUrl),
      clientId,
      clientSecret,
      undefined,
      {
        // Allow issuer mismatch when using internal URL for discovery
        execute: [openidClient.allowInsecureRequests],
      },
    );

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

  async getAuthorizationUrl(state: string): Promise<string> {
    const config = await this.getOidcConfig();
    // Build callback URL from APP_URL if not explicitly set
    const callbackUrl =
      getSecret('OIDC_CALLBACK_URL') ||
      `${getSecret('APP_URL', 'http://localhost')}/api/v2/auth/callback`;

    if (!callbackUrl) {
      throw new Error('OIDC_CALLBACK_URL not configured');
    }

    const codeVerifier = openidClient.randomPKCECodeVerifier();
    const codeChallenge =
      await openidClient.calculatePKCECodeChallenge(codeVerifier);

    // Store code verifier in state (encoded)
    const stateData = JSON.stringify({ state, codeVerifier });
    const encodedState = Buffer.from(stateData).toString('base64url');

    const authUrl = openidClient.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: 'openid email profile',
      state: encodedState,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return authUrl.href;
  }

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

    // Exchange code for tokens
    const tokens = await openidClient.authorizationCodeGrant(
      config,
      new URL(callbackUrl),
      {
        pkceCodeVerifier: codeVerifier,
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
