import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Partial<Record<keyof AuthService, jest.Mock>>;

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
      updateProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('should login and set refresh cookie with proper options', async () => {
      const mockResult = {
        user: { id: 'u1', email: 'teacher@teachflow.vn', role: 'TEACHER' },
        tokens: { accessToken: 'acc_123', refreshToken: 'ref_123', tokenType: 'Bearer', expiresIn: '15m' },
      };
      (authService.login as jest.Mock).mockResolvedValue(mockResult);

      const mockResponse = {
        cookie: jest.fn(),
      } as any;

      const res = await controller.login(
        { email: 'teacher@teachflow.vn', password: 'Password123@' },
        mockResponse,
      );

      expect(authService.login).toHaveBeenCalledWith({
        email: 'teacher@teachflow.vn',
        password: 'Password123@',
      });
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'ref_123',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
      expect(res.accessToken).toBe('acc_123');
      expect((res as any).refreshToken).toBeUndefined();
    });
  });

  describe('register', () => {
    it('delegates the strict public payload without a role', async () => {
      const dto = { fullName: 'Nguyễn Văn A', email: 'teacher@example.com', password: 'Strong@123' };
      (authService.register as jest.Mock).mockResolvedValue({ success: true, user: { role: 'TEACHER' } });
      const result = await controller.register(dto);
      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result.user.role).toBe('TEACHER');
    });
  });

  describe('refresh', () => {
    it('should throw 401 UnauthorizedException if refresh token is missing', async () => {
      const mockReq = { cookies: {} } as any;
      const mockRes = { cookie: jest.fn() } as any;

      await expect(controller.refresh(mockReq, {} as any, mockRes)).rejects.toThrow(
        new UnauthorizedException('Không tìm thấy refresh token'),
      );
    });

    it('should read refresh token from cookie and refresh tokens', async () => {
      const payload = { sub: 'u1', email: 'teacher@teachflow.vn' };
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const validJwt = `header.${base64Payload}.sig`;

      const mockReq = {
        cookies: { refreshToken: validJwt },
      } as any;
      const mockRes = { cookie: jest.fn() } as any;

      (authService.refreshToken as jest.Mock).mockResolvedValue({
        accessToken: 'new_acc_123',
        refreshToken: 'new_ref_123',
        tokenType: 'Bearer',
        expiresIn: '15m',
      });

      const res = await controller.refresh(mockReq, {} as any, mockRes);

      expect(authService.refreshToken).toHaveBeenCalledWith('u1', validJwt);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new_ref_123',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
      expect(res.accessToken).toBe('new_acc_123');
      expect((res as any).refreshToken).toBeUndefined();
    });

    it('should throw 401 if refresh token is malformed', async () => {
      const mockReq = {
        cookies: { refreshToken: 'invalid_malformed_token' },
      } as any;
      const mockRes = { cookie: jest.fn() } as any;

      await expect(controller.refresh(mockReq, {} as any, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should clear refresh cookie and call authService.logout', async () => {
      const mockRes = { clearCookie: jest.fn() } as any;
      (authService.logout as jest.Mock).mockResolvedValue({ message: 'Đăng xuất thành công' });

      const mockReq = { cookies: { refreshToken: 'ref_123' } } as any;
      const res = await controller.logout(mockReq, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
      expect(authService.logout).toHaveBeenCalledWith(undefined, 'ref_123');
      expect(res).toEqual({ message: 'Đăng xuất thành công' });
    });
  });
});
