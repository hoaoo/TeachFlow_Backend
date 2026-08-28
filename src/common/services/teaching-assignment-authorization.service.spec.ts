import { ForbiddenException } from '@nestjs/common';
import { TeachingAssignmentAuthorizationService } from './teaching-assignment-authorization.service';

describe('TeachingAssignmentAuthorizationService roster mutations', () => {
  const prisma = {
    classroom: { findUnique: jest.fn() },
  } as any;
  const service = new TeachingAssignmentAuthorizationService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('allows the authenticated homeroom teacher', async () => {
    prisma.classroom.findUnique.mockResolvedValue({
      id: 'class-a',
      homeroomTeacherId: 'teacher-homeroom',
      deletedAt: null,
      isActive: true,
      teachingAssignments: [],
    });

    await expect(
      service.assertAuthenticatedHomeroomTeacher('class-a', 'teacher-homeroom'),
    ).resolves.toEqual(expect.objectContaining({ id: 'class-a' }));
  });

  it('returns 403 for a subject teacher assigned to the classroom', async () => {
    prisma.classroom.findUnique.mockResolvedValue({
      id: 'class-a',
      homeroomTeacherId: 'teacher-homeroom',
      deletedAt: null,
      isActive: true,
      teachingAssignments: [{ teacherId: 'teacher-subject', isActive: true }],
    });

    await expect(
      service.assertAuthenticatedHomeroomTeacher('class-a', 'teacher-subject'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns 403 for another teacher and for a missing teacher identity', async () => {
    prisma.classroom.findUnique.mockResolvedValue({
      id: 'class-a',
      homeroomTeacherId: 'teacher-homeroom',
      deletedAt: null,
      isActive: true,
      teachingAssignments: [],
    });

    await expect(
      service.assertAuthenticatedHomeroomTeacher('class-a', 'teacher-other'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.assertAuthenticatedHomeroomTeacher('class-a', undefined),
    ).rejects.toThrow(ForbiddenException);
  });
});
