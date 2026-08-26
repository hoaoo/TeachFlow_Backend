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
import { AuthResponseDto, RefreshResponseDto, UserResponseDto } from './dto/auth-response.dto';
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
  @ApiOperation({ summary: 'Đăng nhập giáo viên/admin (Hỗ trợ cả Mobile Native và Web)' })
  @ApiResponse({ status: 200, type: AuthResponseDto, description: 'Đăng nhập thành công, trả về Access Token và Refresh Token' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(loginDto);

    // Set HTTP-only cookie for secure refresh token on web
    response.cookie('refreshToken', result.tokens.refreshToken, getRefreshTokenCookieOptions());

    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken, // Included in JSON body for Mobile Native SecureStore
      tokenType: result.tokens.tokenType,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới Access Token bằng Refresh Token (qua JSON body hoặc cookie)' })
  @ApiResponse({ status: 200, type: RefreshResponseDto, description: 'Cấp mới Access Token & Refresh Token' })
  async refresh(
    @Req() request: Request,
    @Body() refreshDto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponseDto> {
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
        refreshToken: tokens.refreshToken, // New rotated refresh token returned for mobile storage
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
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Đăng xuất và thu hồi Refresh Token' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  async logout(
    @Req() request: Request,
    @Body() body?: RefreshTokenDto,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const refreshToken = body?.refreshToken || request.cookies?.refreshToken;
    let userId: string | undefined;

    // Check bearer authorization header if present
    const authHeader = request.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64').toString('utf8'),
        );
        userId = decoded.sub;
      } catch {}
    }

    response?.clearCookie('refreshToken', getClearRefreshTokenCookieOptions());
    return this.authService.logout(userId, refreshToken);
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Lấy thông tin tài khoản đang đăng nhập' })
  @ApiResponse({ status: 200, type: UserResponseDto, description: 'Thông tin người dùng hiện tại' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.userId);
  }

  @Patch('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân của giáo viên' })
  @ApiResponse({ status: 200, type: UserResponseDto, description: 'Hồ sơ đã cập nhật' })
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }
}
