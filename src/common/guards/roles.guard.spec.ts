import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access if no roles are required on route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);

    const context: any = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: '1', role: 'TEACHER' } }),
      }),
    };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has required role (ADMIN)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

    const context: any = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: 'admin-1', role: 'ADMIN' } }),
      }),
    };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user has TEACHER role on ADMIN route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

    const context: any = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: 'teacher-1', role: 'TEACHER' } }),
      }),
    };

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
