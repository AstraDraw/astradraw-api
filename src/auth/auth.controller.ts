import {
  Controller,
  Get,
  Query,
  Res,
  UnauthorizedException,
  Logger,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { CurrentUser } from './current-user.decorator';
import { User } from '@prisma/client';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Check if OIDC is configured
   */
  @Get('status')
  getStatus() {
    return {
      oidcConfigured: this.authService.isOidcConfigured(),
    };
  }

  /**
   * Initiate OIDC login flow
   * Redirects to Authentik login page
   */
  @Get('login')
  async login(
    @Query('redirect') redirect: string,
    @Res() res: Response,
  ) {
    if (!this.authService.isOidcConfigured()) {
      throw new UnauthorizedException('OIDC is not configured');
    }

    // Generate random state for CSRF protection
    const state = redirect || '/';
    
    try {
      const authUrl = await this.authService.getAuthorizationUrl(state);
      this.logger.log(`Redirecting to OIDC provider`);
      res.redirect(authUrl);
    } catch (error) {
      this.logger.error(`Failed to initiate login: ${error.message}`);
      throw new UnauthorizedException('Failed to initiate login');
    }
  }

  /**
   * OIDC callback handler
   * Exchanges authorization code for tokens and creates session
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    // Handle OIDC errors
    if (error) {
      this.logger.error(`OIDC error: ${error} - ${errorDescription}`);
      const appUrl = process.env.APP_URL || 'http://localhost';
      return res.redirect(`${appUrl}?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      throw new UnauthorizedException('Missing code or state parameter');
    }

    try {
      const { accessToken, user } = await this.authService.handleCallback(code, state);

      // Decode state to get original redirect URL
      let redirectUrl = '/';
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
        redirectUrl = stateData.state || '/';
      } catch {
        // Use default redirect
      }

      const appUrl = process.env.APP_URL || 'http://localhost';
      
      // Set JWT as HttpOnly cookie
      res.cookie('astradraw_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      this.logger.log(`User ${user.email} logged in successfully`);
      
      // Redirect to app with success
      res.redirect(`${appUrl}${redirectUrl}#auth=success`);
    } catch (error) {
      this.logger.error(`Callback error: ${error.message}`);
      const appUrl = process.env.APP_URL || 'http://localhost';
      res.redirect(`${appUrl}?error=auth_failed`);
    }
  }

  /**
   * Get current user info
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }

  /**
   * Logout - clear session cookie
   */
  @Get('logout')
  async logout(@Res() res: Response) {
    res.clearCookie('astradraw_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    const appUrl = process.env.APP_URL || 'http://localhost';
    res.redirect(appUrl);
  }
}
