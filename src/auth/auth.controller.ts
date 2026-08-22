import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

function getRefreshTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd, // Must be true when sameSite is 'none' in production HTTPS
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

function getClearRefreshTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký công khai tài khoản giáo viên' })
  @ApiResponse({ status: 201, description: 'Tạo tài khoản TEACHER thành công' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập giáo viên/admin' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, trả về Access Token và Refresh Token' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(loginDto);

    // Set HTTP-only cookie for secure refresh token
    response.cookie('refreshToken', result.tokens.refreshToken, getRefreshTokenCookieOptions());

    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      tokenType: result.tokens.tokenType,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới Access Token' })
  async refresh(
    @Req() request: Request,
    @Body() refreshDto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = refreshDto?.refreshToken || request.cookies?.refreshToken;
    if (!token) {
      throw new UnauthorizedException('Không tìm thấy refresh token');
    }

    // Decode token to get userId
    try {
      const decoded = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString('utf8'),
      );
      const userId = decoded.sub;
      const tokens = await this.authService.refreshToken(userId, token);

      response.cookie('refreshToken', tokens.refreshToken, getRefreshTokenCookieOptions());

      return {
        accessToken: tokens.accessToken,
        tokenType: tokens.tokenType,
        expiresIn: tokens.expiresIn,
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất tài khoản' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.refreshToken;
    response.clearCookie('refreshToken', getClearRefreshTokenCookieOptions());
    return this.authService.logout(undefined, refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản đang đăng nhập' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.userId);
  }

  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân của giáo viên' })
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }
}
