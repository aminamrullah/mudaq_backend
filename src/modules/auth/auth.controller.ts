import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Res,
} from '@nestjs/common';
import * as express from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshTokenDto, RequestOtpDto, VerifyOtpDto, ResetPasswordDto } from './dto/auth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setAuthCookies(res: express.Response, accessToken: string, refreshToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  private clearAuthCookies(res: express.Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('access_token', '', { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', maxAge: 0 });
    res.cookie('refresh_token', '', { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', maxAge: 0 });
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  async login(@Body() dto: LoginDto, @Request() req: any, @Res({ passthrough: true }) res: express.Response) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    const result = await this.authService.login(dto, { ip, ua });
    this.setAuthCookies(res, result.access_token, result.refresh_token);
    return result;
  }

  @Post('request-otp')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP via WhatsApp' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and login' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Request() req: any, @Res({ passthrough: true }) res: express.Response) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    const result = await this.authService.verifyOtp(dto, { ip, ua });
    this.setAuthCookies(res, result.access_token, result.refresh_token);
    return result;
  }


  @Post('register')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register new user (Admin only)' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: express.Response) {
    const result = await this.authService.register(dto);
    this.setAuthCookies(res, result.access_token, result.refresh_token);
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto, @Request() req: any, @Res({ passthrough: true }) res: express.Response) {
    let refreshToken = dto.refresh_token;
    if (!refreshToken && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc: any, c: string) => {
        const [key, val] = c.trim().split('=').map(decodeURIComponent);
        return { ...acc, [key]: val };
      }, {} as any);
      refreshToken = cookies['refresh_token'];
    }
    const result = await this.authService.refreshToken(refreshToken);
    this.setAuthCookies(res, result.access_token, result.refresh_token);
    return result;
  }

  @Post('request-password-reset')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset OTP' })
  async requestPasswordReset(@Body() dto: RequestOtpDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using OTP' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  async logout(@CurrentUser('id') userId: string, @Request() req: any, @Res({ passthrough: true }) res: express.Response) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    const result = await this.authService.logout(userId, { ip, ua });
    this.clearAuthCookies(res);
    return result;
  }
}
