import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as openidClient from 'openid-client';
import { UsersService } from '../users/users.service';

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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private oidcConfig: openidClient.Configuration | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  private async getOidcConfig(): Promise<openidClient.Configuration> {
    if (this.oidcConfig) {
      return this.oidcConfig;
    }

    const issuerUrl = process.env.OIDC_ISSUER_URL;
    const clientId = process.env.OIDC_CLIENT_ID;
    const clientSecret = process.env.OIDC_CLIENT_SECRET;

    if (!issuerUrl || !clientId || !clientSecret) {
      throw new Error('OIDC configuration missing');
    }

    this.logger.log(`Discovering OIDC provider at ${issuerUrl}`);
    
    this.oidcConfig = await openidClient.discovery(
      new URL(issuerUrl),
      clientId,
      clientSecret,
    );

    return this.oidcConfig;
  }

  isOidcConfigured(): boolean {
    return !!(
      process.env.OIDC_ISSUER_URL &&
      process.env.OIDC_CLIENT_ID &&
      process.env.OIDC_CLIENT_SECRET
    );
  }

  async getAuthorizationUrl(state: string): Promise<string> {
    const config = await this.getOidcConfig();
    const callbackUrl = process.env.OIDC_CALLBACK_URL;

    if (!callbackUrl) {
      throw new Error('OIDC_CALLBACK_URL not configured');
    }

    const codeVerifier = openidClient.randomPKCECodeVerifier();
    const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier);

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
    const callbackUrl = process.env.OIDC_CALLBACK_URL;

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
    const tokens = await openidClient.authorizationCodeGrant(config, new URL(callbackUrl), {
      pkceCodeVerifier: codeVerifier,
    });

    // Get user info
    const userInfo = await openidClient.fetchUserInfo(
      config,
      tokens.access_token,
      tokens.claims()?.sub,
    ) as OidcUserInfo;

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
