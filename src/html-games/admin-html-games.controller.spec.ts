import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminHtmlGamesController } from './admin-html-games.controller';

describe('AdminHtmlGamesController RBAC', () => {
  it('declares ADMIN-only server-side role metadata', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminHtmlGamesController)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, AdminHtmlGamesController)).not.toContain('TEACHER');
  });

  it('returns 403 before a teacher can create an admin game', () => {
    const guard = new RolesGuard(new Reflector());
    const context = {
      getHandler: () => AdminHtmlGamesController.prototype.create,
      getClass: () => AdminHtmlGamesController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: 'TEACHER', teacherId: 'teacher-a' } }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
