import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonPlanDto } from './dto/create-lesson-plan.dto';
import { UpdateLessonPlanDto } from './dto/update-lesson-plan.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ReorderActivitiesDto } from './dto/reorder-activities.dto';

@Injectable()
export class LessonPlansService {
  private readonly logger = new Logger(LessonPlansService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(teacherId?: string) {
    const where: any = { deletedAt: null };
    if (teacherId) {
      where.teacherId = teacherId;
    }

    const plans = await this.prisma.lessonPlan.findMany({
      where,
      include: {
        activities: {
          orderBy: { sortOrder: 'asc' },
        },
        classroom: true,
        subject: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return plans.map((p) => this.mapLessonPlan(p));
  }

  async findOne(id: string, teacherId?: string) {
    const plan = await this.prisma.lessonPlan.findUnique({
      where: { id },
      include: {
        activities: {
          orderBy: { sortOrder: 'asc' },
        },
        classroom: true,
        subject: true,
        resources: {
          where: { resource: { deletedAt: null } },
          include: {
            resource: {
              include: {
                subject: true,
                grade: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!plan || plan.deletedAt) {
      throw new NotFoundException(`Không tìm thấy giáo án với mã ${id}`);
    }

    if (teacherId && plan.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập giáo án này');
    }

    return this.mapLessonPlan(plan);
  }

  async create(dto: CreateLessonPlanDto, teacherId: string) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.lessonPlan.create({
        data: {
          teacherId,
          title: dto.title,
          subjectName: dto.subject || 'Toán',
          gradeName: dto.grade || 'Lớp 4A',
          teachingDate: dto.date ? new Date(dto.date) : new Date(),
          durationMinutes: dto.duration || 40,
          objectives: dto.objective || '',
          classroomId: dto.classroomId,
          subjectId: dto.subjectId,
          lessonId: dto.lessonId,
          status: 'DRAFT',
          version: 1,
        },
      });

      if (dto.activities && dto.activities.length > 0) {
        await Promise.all(
          dto.activities.map((act, index) =>
            tx.lessonPlanActivity.create({
              data: {
                lessonPlanId: plan.id,
                phase: act.phase || 'Hoạt động',
                title: act.title,
                durationMinutes: act.minutes || 5,
                method: act.method || '',
                technique: act.technique || '',
                competencies: act.competencies || '',
                qualities: act.qualities || '',
                objective: act.objective || '',
                teacherActivity: act.teacher || '',
                studentActivity: act.students || '',
                sortOrder: act.sortOrder ?? index,
              },
            }),
          ),
        );
      }

      const created = await tx.lessonPlan.findUnique({
        where: { id: plan.id },
        include: {
          activities: { orderBy: { sortOrder: 'asc' } },
          classroom: true,
          subject: true,
        },
      });

      return this.mapLessonPlan(created);
    });
  }

  async update(id: string, dto: UpdateLessonPlanDto, teacherId: string) {
    const existing = await this.prisma.lessonPlan.findUnique({
      where: { id },
      include: { activities: true },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy giáo án với mã ${id}`);
    }

    if (teacherId && existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa giáo án này');
    }

    // Optimistic Concurrency Control
    if (dto.version !== undefined && dto.version !== existing.version) {
      throw new ConflictException(
        'Giáo án đã được cập nhật bởi một phiên làm việc khác. Vui lòng tải lại trang.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const data: any = {
        version: existing.version + 1,
      };

      if (dto.title) data.title = dto.title;
      if (dto.subject) data.subjectName = dto.subject;
      if (dto.grade) data.gradeName = dto.grade;
      if (dto.date) data.teachingDate = new Date(dto.date);
      if (dto.duration) data.durationMinutes = dto.duration;
      if (dto.objective !== undefined) data.objectives = dto.objective;

      const updated = await tx.lessonPlan.update({
        where: { id, version: existing.version },
        data,
      });

      // If activities array is supplied, replace activities
      if (dto.activities && Array.isArray(dto.activities)) {
        await tx.lessonPlanActivity.deleteMany({
          where: { lessonPlanId: id },
        });

        await Promise.all(
          dto.activities.map((act, index) =>
            tx.lessonPlanActivity.create({
              data: {
                lessonPlanId: id,
                phase: act.phase || 'Hoạt động',
                title: act.title,
                durationMinutes: act.minutes || 5,
                method: act.method || '',
                technique: act.technique || '',
                competencies: act.competencies || '',
                qualities: act.qualities || '',
                objective: act.objective || '',
                teacherActivity: act.teacher || '',
                studentActivity: act.students || '',
                sortOrder: act.sortOrder ?? index,
              },
            }),
          ),
        );
      }

      const refreshed = await tx.lessonPlan.findUnique({
        where: { id },
        include: {
          activities: { orderBy: { sortOrder: 'asc' } },
          classroom: true,
          subject: true,
        },
      });

      return this.mapLessonPlan(refreshed);
    });
  }

  async remove(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    await this.prisma.lessonPlan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Đã xóa giáo án' };
  }

  async duplicate(id: string, teacherId: string) {
    const original = await this.findOne(id, teacherId);

    return this.prisma.$transaction(async (tx) => {
      const copy = await tx.lessonPlan.create({
        data: {
          teacherId,
          title: `${original.title} (Bản sao)`,
          subjectName: original.subject,
          gradeName: original.grade,
          teachingDate: new Date(),
          durationMinutes: original.duration,
          objectives: original.objective,
          status: 'DRAFT',
          version: 1,
        },
      });

      if (original.activities && original.activities.length > 0) {
        await Promise.all(
          original.activities.map((act: any, index: number) =>
            tx.lessonPlanActivity.create({
              data: {
                lessonPlanId: copy.id,
                phase: act.phase,
                title: act.title,
                durationMinutes: act.minutes,
                method: act.method,
                technique: act.technique,
                competencies: act.competencies,
                qualities: act.qualities,
                objective: act.objective,
                teacherActivity: act.teacher,
                studentActivity: act.students,
                sortOrder: index,
              },
            }),
          ),
        );
      }

      const refreshed = await tx.lessonPlan.findUnique({
        where: { id: copy.id },
        include: {
          activities: { orderBy: { sortOrder: 'asc' } },
          classroom: true,
          subject: true,
        },
      });

      return this.mapLessonPlan(refreshed);
    });
  }

  async addActivity(lessonPlanId: string, dto: CreateActivityDto, teacherId: string) {
    await this.findOne(lessonPlanId, teacherId);

    const count = await this.prisma.lessonPlanActivity.count({
      where: { lessonPlanId },
    });

    const activity = await this.prisma.lessonPlanActivity.create({
      data: {
        lessonPlanId,
        phase: dto.phase || 'Hoạt động mới',
        title: dto.title,
        durationMinutes: dto.minutes || 5,
        method: dto.method || '',
        technique: dto.technique || '',
        competencies: dto.competencies || '',
        qualities: dto.qualities || '',
        objective: dto.objective || '',
        teacherActivity: dto.teacher || '',
        studentActivity: dto.students || '',
        sortOrder: dto.sortOrder ?? count,
      },
    });

    return this.mapActivity(activity);
  }

  async updateActivity(
    lessonPlanId: string,
    activityId: string,
    dto: UpdateActivityDto,
    teacherId: string,
  ) {
    await this.findOne(lessonPlanId, teacherId);

    const activity = await this.prisma.lessonPlanActivity.findUnique({
      where: { id: activityId },
    });

    if (!activity || activity.lessonPlanId !== lessonPlanId) {
      throw new NotFoundException('Không tìm thấy hoạt động trong giáo án này');
    }

    const updated = await this.prisma.lessonPlanActivity.update({
      where: { id: activityId },
      data: {
        phase: dto.phase,
        title: dto.title,
        durationMinutes: dto.minutes,
        method: dto.method,
        technique: dto.technique,
        competencies: dto.competencies,
        qualities: dto.qualities,
        objective: dto.objective,
        teacherActivity: dto.teacher,
        studentActivity: dto.students,
        sortOrder: dto.sortOrder,
      },
    });

    return this.mapActivity(updated);
  }

  async removeActivity(lessonPlanId: string, activityId: string, teacherId: string) {
    await this.findOne(lessonPlanId, teacherId);

    const activity = await this.prisma.lessonPlanActivity.findUnique({
      where: { id: activityId },
    });

    if (!activity || activity.lessonPlanId !== lessonPlanId) {
      throw new NotFoundException('Không tìm thấy hoạt động');
    }

    await this.prisma.lessonPlanActivity.delete({
      where: { id: activityId },
    });

    return { success: true, message: 'Đã xóa hoạt động' };
  }

  async reorderActivities(
    lessonPlanId: string,
    dto: ReorderActivitiesDto,
    teacherId: string,
  ) {
    await this.findOne(lessonPlanId, teacherId);

    await this.prisma.$transaction(
      dto.activityIds.map((id, index) =>
        this.prisma.lessonPlanActivity.updateMany({
          where: { id, lessonPlanId },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.findOne(lessonPlanId, teacherId);
  }

  /**
   * Attach a resource to a lesson plan (prevents duplicate link)
   */
  async attachResource(lessonPlanId: string, resourceId: string, teacherId?: string) {
    await this.findOne(lessonPlanId, teacherId);

    const resource = await this.prisma.teachingResource.findUnique({
      where: { id: resourceId },
    });

    if (!resource || resource.deletedAt) {
      throw new NotFoundException('Không tìm thấy tài nguyên dạy học để đính kèm');
    }

    if (teacherId && resource.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền sử dụng tài nguyên này');
    }

    // Upsert to ensure no duplicate link error
    const link = await this.prisma.lessonPlanResource.upsert({
      where: {
        lessonPlanId_resourceId: {
          lessonPlanId,
          resourceId,
        },
      },
      update: {},
      create: {
        lessonPlanId,
        resourceId,
      },
      include: {
        resource: {
          include: {
            subject: true,
            grade: true,
          },
        },
      },
    });

    return this.mapAttachedResource(link.resource);
  }

  /**
   * Detach a resource from a lesson plan
   */
  async detachResource(lessonPlanId: string, resourceId: string, teacherId?: string) {
    await this.findOne(lessonPlanId, teacherId);

    await this.prisma.lessonPlanResource.deleteMany({
      where: {
        lessonPlanId,
        resourceId,
      },
    });

    return { success: true, message: 'Đã gỡ tài nguyên khỏi giáo án' };
  }

  /**
   * Get all resources attached to a lesson plan
   */
  async getAttachedResources(lessonPlanId: string, teacherId?: string) {
    await this.findOne(lessonPlanId, teacherId);

    const links = await this.prisma.lessonPlanResource.findMany({
      where: {
        lessonPlanId,
        resource: { deletedAt: null },
      },
      include: {
        resource: {
          include: {
            subject: true,
            grade: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((l) => this.mapAttachedResource(l.resource));
  }

  private mapLessonPlan(plan: any) {
    const activities = (plan.activities || []).map((a: any) => this.mapActivity(a));
    const resources = (plan.resources || []).map((r: any) => this.mapAttachedResource(r.resource));
    return {
      id: plan.id,
      title: plan.title,
      subject: plan.subjectName || plan.subject?.name || 'Toán',
      grade: plan.gradeName || plan.classroom?.name || 'Lớp 4A',
      date: plan.teachingDate ? new Date(plan.teachingDate).toISOString().split('T')[0] : '2026-08-21',
      duration: plan.durationMinutes || 40,
      objective: plan.objectives || '',
      status: plan.status,
      version: plan.version,
      activities,
      resources,
    };
  }

  private mapAttachedResource(r: any) {
    if (!r) return null;
    const extension = r.originalFileName ? r.originalFileName.split('.').pop()?.toUpperCase() : '';
    const formattedSize = r.size
      ? r.size < 1024 * 1024
        ? `${Math.round(r.size / 1024)} KB`
        : `${(r.size / (1024 * 1024)).toFixed(1)} MB`
      : '0 KB';

    return {
      id: r.id,
      name: r.name || r.title,
      title: r.title || r.name,
      originalFileName: r.originalFileName,
      resourceType: r.resourceType || 'DOCUMENT',
      mimeType: r.mimeType,
      size: r.size,
      formattedSize,
      extension,
      subjectName: r.subject?.name || null,
      gradeName: r.grade?.name || null,
      description: r.description,
      status: r.status || 'ACTIVE',
      meta: r.meta || `${formattedSize} · ${extension || 'DOC'}`,
      tone: r.tone || 'teal',
      createdAt: r.createdAt,
    };
  }

  private mapActivity(act: any) {
    return {
      id: act.id,
      phase: act.phase,
      title: act.title,
      minutes: act.durationMinutes,
      method: act.method || '',
      technique: act.technique || '',
      competencies: act.competencies || '',
      qualities: act.qualities || '',
      objective: act.objective || '',
      teacher: act.teacherActivity || '',
      students: act.studentActivity || '',
    };
  }
}
