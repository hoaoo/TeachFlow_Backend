import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  PayloadTooLargeException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { StorageService } from '../resources/storage/storage.service';
import { lessonPlanToRenderModel, LessonPlanRenderModel } from '../export/render-models';
import { CreateLessonPlanDto } from './dto/create-lesson-plan.dto';
import { UpdateLessonPlanDto } from './dto/update-lesson-plan.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ReorderActivitiesDto } from './dto/reorder-activities.dto';
import { SaveActivityToLibraryDto } from './dto/save-to-library.dto';
import { UploadLessonPlanDto } from './dto/upload-lesson-plan.dto';

const ALLOWED_UPLOAD_EXTENSIONS = ['.docx', '.pdf'];
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.ts',
  '.php', '.py', '.rb', '.pl', '.html', '.htm', '.msi', '.jar',
  '.com', '.scr'
];

@Injectable()
export class LessonPlansService {
  private readonly logger = new Logger(LessonPlansService.name);

  constructor(
    private prisma: PrismaService,
    private assignmentAuth: TeachingAssignmentAuthorizationService,
    private storageService: StorageService,
    private configService: ConfigService,
    @Optional() private auditService?: AuditService,
  ) {}

  async findAll(
    teacherId: string,
    filters?: {
      classroomId?: string;
      subjectId?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
    },
  ) {
    const where: any = {
      deletedAt: null,
      OR: [
        { teacherId },
        { teachingAssignment: { teacherId } },
      ],
    };

    if (filters?.classroomId) {
      where.classroomId = filters.classroomId;
    }
    if (filters?.subjectId) {
      where.subjectId = filters.subjectId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.teachingDate = {};
      if (filters?.dateFrom) {
        where.teachingDate.gte = new Date(filters.dateFrom + 'T00:00:00');
      }
      if (filters?.dateTo) {
        where.teachingDate.lte = new Date(filters.dateTo + 'T23:59:59');
      }
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.AND = [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { topic: { contains: q, mode: 'insensitive' } },
            { subjectName: { contains: q, mode: 'insensitive' } },
            { gradeName: { contains: q, mode: 'insensitive' } },
            { originalFileName: { contains: q, mode: 'insensitive' } },
            { classroom: { name: { contains: q, mode: 'insensitive' } } },
            { subject: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const plans = await this.prisma.lessonPlan.findMany({
      where,
      include: {
        activities: {
          select: { id: true, phase: true, title: true, durationMinutes: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
        classroom: true,
        subject: true,
        schedules: {
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            plannedDate: true,
            startTime: true,
            endTime: true,
            status: true,
            classroom: { select: { id: true, name: true } },
          },
          orderBy: { plannedDate: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return plans.map((p) => this.mapLessonPlanSummary(p));
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
        teachingAssignment: {
          include: {
            subject: true,
            classroom: { include: { grade: true } },
            schoolYear: true,
          },
        },
        schedules: {
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            plannedDate: true,
            startTime: true,
            endTime: true,
            status: true,
            classroom: { select: { id: true, name: true } },
          },
          orderBy: { plannedDate: 'asc' },
        },
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
        htmlGames: {
          where: { htmlGame: { status: 'PUBLISHED' } },
          include: {
            htmlGame: {
              include: {
                subject: true,
                grade: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        versions: {
          select: {
            id: true,
            versionNumber: true,
            title: true,
            changeSummary: true,
            createdAt: true,
          },
          orderBy: { versionNumber: 'desc' },
          take: 10,
        },
      },
    });

    if (!plan || plan.deletedAt) {
      throw new NotFoundException(`Không tìm thấy giáo án với mã ${id}`);
    }

    const planTeacherId = plan.teachingAssignment?.teacherId || plan.teacherId;
    if (teacherId && planTeacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập giáo án này');
    }

    return this.mapLessonPlanDetail(plan);
  }

  async previewById(id: string, teacherId?: string): Promise<LessonPlanRenderModel> {
    const plan = await this.findOne(id, teacherId);
    return lessonPlanToRenderModel(plan);
  }

  previewDraft(dto: CreateLessonPlanDto, teacherName?: string): LessonPlanRenderModel {
    return lessonPlanToRenderModel(dto, teacherName);
  }

  async create(dto: CreateLessonPlanDto, teacherId: string) {
    let assignmentId: string | null = null;
    let effectiveClassroomId = dto.classroomId;
    let effectiveSubjectId = dto.subjectId;
    let effectiveSubjectName = dto.subject || 'Toán';
    let effectiveGradeName = dto.grade || 'Lớp 4A';

    if (dto.teachingAssignmentId) {
      const asg = await this.assignmentAuth.validateAssignmentForCreate(
        dto.teachingAssignmentId,
        teacherId,
      );
      assignmentId = asg.id;
      effectiveClassroomId = asg.classroomId;
      effectiveSubjectId = asg.subjectId;
      effectiveSubjectName = asg.subject?.name || effectiveSubjectName;
      effectiveGradeName = asg.classroom?.grade?.name || asg.classroom?.name || effectiveGradeName;
    } else if (dto.classroomId) {
      try {
        const asg = await this.assignmentAuth.resolveAssignmentFromContext({
          teacherId,
          classroomId: dto.classroomId,
          subjectId: dto.subjectId,
        });
        assignmentId = asg.id;
        effectiveClassroomId = asg.classroomId;
        effectiveSubjectId = asg.subjectId;
        effectiveSubjectName = asg.subject?.name || effectiveSubjectName;
        effectiveGradeName = asg.classroom?.grade?.name || asg.classroom?.name || effectiveGradeName;
      } catch (err) {
        // Standalone fallback
      }
    }

    // Verify schedule ownership if scheduleId is supplied
    if (dto.scheduleId) {
      const sched = await this.prisma.schedule.findUnique({
        where: { id: dto.scheduleId },
      });
      if (!sched || sched.deletedAt || sched.teacherId !== teacherId) {
        throw new ForbiddenException('Lịch dạy không tồn tại hoặc không thuộc quyền sở hữu của bạn');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.lessonPlan.create({
        data: {
          teacherId,
          teachingAssignmentId: assignmentId,
          title: dto.title.trim(),
          topic: dto.topic?.trim() || null,
          subjectName: effectiveSubjectName,
          gradeName: effectiveGradeName,
          teachingDate: dto.date ? new Date(dto.date) : new Date(),
          durationMinutes: dto.duration || 40,
          objectives: dto.objective || '',
          specificCompetencies: dto.specificCompetencies || null,
          generalCompetencies: dto.generalCompetencies || null,
          qualities: dto.qualities || null,
          teachingEquipment: dto.teachingEquipment || null,
          postLessonAdjustment: dto.postLessonAdjustment || null,
          notes: dto.notes || null,
          classroomId: effectiveClassroomId,
          subjectId: effectiveSubjectId,
          lessonId: dto.lessonId,
          status: (dto.status as any) || 'DRAFT',
          sourceType: 'NATIVE',
          version: 1,
        },
      });

      if (dto.activities && dto.activities.length > 0) {
        await Promise.all(
          dto.activities.map((act, index) =>
            tx.lessonPlanActivity.create({
              data: {
                lessonPlanId: plan.id,
                activityType: this.mapPhaseToActivityType(act.phase) as any,
                phase: act.phase || 'Hoạt động',
                title: act.title,
                durationMinutes: act.minutes || 5,
                method: act.method || '',
                technique: act.technique || '',
                competencies: act.competencies || '',
                qualities: act.qualities || '',
                equipment: act.equipment || null,
                objective: act.objective || '',
                teacherActivity: act.teacher || '',
                studentActivity: act.students || '',
                sortOrder: act.sortOrder ?? index,
              },
            }),
          ),
        );
      }

      // Link schedule if scheduleId was given
      if (dto.scheduleId) {
        await tx.schedule.update({
          where: { id: dto.scheduleId },
          data: { lessonPlanId: plan.id },
        });
      }

      // Create initial version snapshot
      const createdWithActivities = await tx.lessonPlan.findUnique({
        where: { id: plan.id },
        include: { activities: { orderBy: { sortOrder: 'asc' } } },
      });

      await tx.lessonPlanVersion.create({
        data: {
          lessonPlanId: plan.id,
          versionNumber: 1,
          title: plan.title,
          contentSnapshot: JSON.stringify(this.mapLessonPlanDetail(createdWithActivities)),
          changeSummary: 'Khởi tạo giáo án ban đầu',
          createdById: teacherId,
        },
      });

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'LESSON_PLAN_CREATE',
        resourceType: 'LessonPlan',
        resourceId: plan.id,
        details: { title: plan.title, subject: effectiveSubjectName, grade: effectiveGradeName },
      });

      const fullCreated = await tx.lessonPlan.findUnique({
        where: { id: plan.id },
        include: {
          activities: { orderBy: { sortOrder: 'asc' } },
          classroom: true,
          subject: true,
          schedules: { select: { id: true, plannedDate: true, startTime: true, endTime: true, status: true } },
          resources: { include: { resource: true } },
          versions: true,
        },
      });

      return this.mapLessonPlanDetail(fullCreated);
    });
  }

  async uploadLessonPlan(
    file: Express.Multer.File,
    dto: UploadLessonPlanDto,
    teacherId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tập tin giáo án để tải lên');
    }

    // 1. File size limit
    const maxSizeMb = parseInt(
      this.configService.get<string>('LESSON_PLAN_UPLOAD_MAX_SIZE') || '25',
      10,
    );
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException(
        `Dung lượng tập tin (${(file.size / (1024 * 1024)).toFixed(1)}MB) vượt quá giới hạn cho phép (${maxSizeMb}MB)`,
      );
    }

    // 2. Sanitize and validate extension
    const rawName = file.originalname || 'uploaded_lesson_plan';
    const sanitizedOriginalName = path.basename(rawName).replace(/[\r\n\t]/g, '');
    const ext = path.extname(sanitizedOriginalName).toLowerCase();

    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      throw new BadRequestException('Tập tin chứa phần mở rộng nguy hiểm không được phép');
    }

    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Hệ thống hiện chỉ hỗ trợ tải lên file DOCX hoặc PDF (.docx, .pdf). Phần mở rộng nhận được: ${ext || 'không có'}`,
      );
    }

    // 3. Determine MIME
    const mimeType =
      ext === '.pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // 4. Verify schedule ownership if scheduleId is supplied
    if (dto.scheduleId) {
      const sched = await this.prisma.schedule.findUnique({
        where: { id: dto.scheduleId },
      });
      if (!sched || sched.deletedAt || sched.teacherId !== teacherId) {
        throw new ForbiddenException('Lịch dạy không tồn tại hoặc không thuộc quyền sở hữu của bạn');
      }
    }

    // 5. Save file physically to storage
    const stored = await this.storageService.saveFile(file, ext);

    try {
      // Determine title
      const title =
        dto.title?.trim() ||
        path.basename(sanitizedOriginalName, ext).trim() ||
        'Giáo án tải lên';

      let effectiveClassroomId = dto.classroomId || null;
      let effectiveSubjectId = dto.subjectId || null;
      let effectiveSubjectName = dto.subject || 'Toán';
      let effectiveGradeName = dto.grade || 'Lớp 4A';

      if (dto.classroomId) {
        const cls = await this.prisma.classroom.findUnique({
          where: { id: dto.classroomId },
          include: { grade: true },
        });
        if (cls) {
          effectiveGradeName = cls.grade?.name || cls.name;
        }
      }

      const plan = await this.prisma.$transaction(async (tx) => {
        const created = await tx.lessonPlan.create({
          data: {
            teacherId,
            title,
            topic: dto.topic?.trim() || null,
            subjectName: effectiveSubjectName,
            gradeName: effectiveGradeName,
            teachingDate: dto.date ? new Date(dto.date) : new Date(),
            durationMinutes: 40,
            objectives: 'Giáo án được tải lên từ tập tin gốc.',
            notes: dto.notes?.trim() || null,
            classroomId: effectiveClassroomId,
            subjectId: effectiveSubjectId,
            status: 'COMPLETED',
            sourceType: 'UPLOADED',
            originalFileName: sanitizedOriginalName,
            storedFileName: stored.storedFileName,
            storagePath: stored.storagePath,
            mimeType,
            fileSize: stored.size,
            version: 1,
          },
        });

        if (dto.scheduleId) {
          await tx.schedule.update({
            where: { id: dto.scheduleId },
            data: { lessonPlanId: created.id },
          });
        }

        await tx.lessonPlanVersion.create({
          data: {
            lessonPlanId: created.id,
            versionNumber: 1,
            title: created.title,
            contentSnapshot: JSON.stringify({
              title: created.title,
              sourceType: 'UPLOADED',
              originalFileName: sanitizedOriginalName,
              fileSize: stored.size,
            }),
            changeSummary: `Tải lên file ${sanitizedOriginalName}`,
            createdById: teacherId,
          },
        });

        return created;
      });

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'LESSON_PLAN_UPLOAD',
        resourceType: 'LessonPlan',
        resourceId: plan.id,
        details: {
          title: plan.title,
          originalFileName: sanitizedOriginalName,
          size: stored.size,
        },
      });

      return this.findOne(plan.id, teacherId);
    } catch (err) {
      // Compensation: Clean up physical file if DB transaction failed
      try {
        await this.storageService.deleteFile(stored.storedFileName);
      } catch (cleanErr) {
        this.logger.warn(`Failed to clean up stored file ${stored.storedFileName} after DB error`);
      }
      throw err;
    }
  }

  async getLessonPlanFile(id: string, teacherId: string) {
    const plan = await this.prisma.lessonPlan.findUnique({
      where: { id },
      include: { teachingAssignment: true },
    });

    if (!plan || plan.deletedAt) {
      throw new NotFoundException('Không tìm thấy giáo án');
    }

    const planTeacherId = plan.teachingAssignment?.teacherId || plan.teacherId;
    if (planTeacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền tải tập tin giáo án này');
    }

    if (plan.sourceType !== 'UPLOADED' || !plan.storedFileName) {
      throw new BadRequestException('Giáo án này không có tập tin tải lên nguồn');
    }

    const filePath = this.storageService.getSafeFilePath(plan.storedFileName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Tập tin không tồn tại trên hệ thống lưu trữ');
    }

    return {
      filePath,
      mimeType: plan.mimeType || 'application/octet-stream',
      originalFileName: plan.originalFileName || `${plan.title}.docx`,
    };
  }

  async update(id: string, dto: UpdateLessonPlanDto, teacherId: string) {
    const existing = await this.prisma.lessonPlan.findUnique({
      where: { id },
      include: { activities: true, teachingAssignment: true },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy giáo án với mã ${id}`);
    }

    const planTeacherId = existing.teachingAssignment?.teacherId || existing.teacherId;
    if (teacherId && planTeacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa giáo án này');
    }

    // Optimistic Concurrency Control
    if (dto.version !== undefined && dto.version !== existing.version) {
      throw new ConflictException(
        'Giáo án đã được cập nhật bởi một phiên làm việc khác hoặc thiết bị khác. Vui lòng tải lại dữ liệu mới nhất.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const nextVersion = existing.version + 1;
      const data: any = {
        version: nextVersion,
      };

      if (dto.title) data.title = dto.title.trim();
      if (dto.topic !== undefined) data.topic = dto.topic ? dto.topic.trim() : null;
      if (dto.subject) data.subjectName = dto.subject;
      if (dto.grade) data.gradeName = dto.grade;
      if (dto.date) data.teachingDate = new Date(dto.date);
      if (dto.duration) data.durationMinutes = dto.duration;
      if (dto.objective !== undefined) data.objectives = dto.objective;
      if (dto.specificCompetencies !== undefined) data.specificCompetencies = dto.specificCompetencies;
      if (dto.generalCompetencies !== undefined) data.generalCompetencies = dto.generalCompetencies;
      if (dto.qualities !== undefined) data.qualities = dto.qualities;
      if (dto.teachingEquipment !== undefined) data.teachingEquipment = dto.teachingEquipment;
      if (dto.postLessonAdjustment !== undefined) data.postLessonAdjustment = dto.postLessonAdjustment;
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.status) data.status = dto.status;

      await tx.lessonPlan.update({
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
                equipment: act.equipment || null,
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
          schedules: { select: { id: true, plannedDate: true, startTime: true, endTime: true, status: true } },
          resources: { include: { resource: true } },
          versions: {
            select: { id: true, versionNumber: true, title: true, changeSummary: true, createdAt: true },
            orderBy: { versionNumber: 'desc' },
            take: 10,
          },
        },
      });

      // Save version snapshot on completion or milestone save
      if (dto.status === 'COMPLETED' || nextVersion % 5 === 0) {
        await tx.lessonPlanVersion.create({
          data: {
            lessonPlanId: id,
            versionNumber: nextVersion,
            title: refreshed!.title,
            contentSnapshot: JSON.stringify(this.mapLessonPlanDetail(refreshed)),
            changeSummary: dto.status === 'COMPLETED' ? 'Hoàn thành giáo án' : `Cập nhật phiên bản v${nextVersion}`,
            createdById: teacherId,
          },
        });
      }

      this.auditService?.log({
        actorUserId: teacherId,
        action: dto.status === 'COMPLETED' ? 'LESSON_PLAN_COMPLETE' : 'LESSON_PLAN_UPDATE',
        resourceType: 'LessonPlan',
        resourceId: id,
        details: { version: nextVersion, title: refreshed!.title },
      });

      return this.mapLessonPlanDetail(refreshed);
    });
  }

  async remove(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    return this.prisma.$transaction(async (tx) => {
      // Unlink any linked schedules gracefully
      await tx.schedule.updateMany({
        where: { lessonPlanId: id },
        data: { lessonPlanId: null },
      });

      await tx.lessonPlan.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'LESSON_PLAN_DELETE',
        resourceType: 'LessonPlan',
        resourceId: id,
      });

      return { success: true, message: 'Đã xóa giáo án thành công' };
    });
  }

  async duplicate(id: string, teacherId: string, customOptions?: { classroomId?: string; date?: string; title?: string }) {
    const original = await this.findOne(id, teacherId);

    return this.prisma.$transaction(async (tx) => {
      const copy = await tx.lessonPlan.create({
        data: {
          teacherId,
          title: customOptions?.title?.trim() || `${original.title} (Bản sao)`,
          topic: original.topic,
          subjectName: original.subject,
          gradeName: original.grade,
          teachingDate: customOptions?.date ? new Date(customOptions.date) : new Date(),
          durationMinutes: original.duration,
          objectives: original.objective,
          specificCompetencies: original.specificCompetencies,
          generalCompetencies: original.generalCompetencies,
          qualities: original.qualities,
          teachingEquipment: original.teachingEquipment,
          postLessonAdjustment: null,
          notes: original.notes,
          classroomId: customOptions?.classroomId || null,
          sourceType: original.sourceType || 'NATIVE',
          originalFileName: original.originalFileName || null,
          storedFileName: original.storedFileName || null,
          storagePath: original.storagePath || null,
          mimeType: original.mimeType || null,
          fileSize: original.fileSize || null,
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
                equipment: act.equipment || null,
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

      await tx.lessonPlanVersion.create({
        data: {
          lessonPlanId: copy.id,
          versionNumber: 1,
          title: copy.title,
          contentSnapshot: JSON.stringify(this.mapLessonPlanDetail(refreshed)),
          changeSummary: `Nhân bản từ giáo án ${original.title}`,
          createdById: teacherId,
        },
      });

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'LESSON_PLAN_DUPLICATE',
        resourceType: 'LessonPlan',
        resourceId: copy.id,
        details: { originalId: id, newTitle: copy.title },
      });

      return this.mapLessonPlanDetail(refreshed);
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
        equipment: dto.equipment || null,
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
        equipment: (dto as any).equipment,
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

  async saveActivityToLibrary(
    lessonPlanId: string,
    activityId: string,
    dto: SaveActivityToLibraryDto,
    teacherId: string,
  ) {
    await this.findOne(lessonPlanId, teacherId);

    const activity = await this.prisma.lessonPlanActivity.findUnique({
      where: { id: activityId },
    });

    if (!activity || activity.lessonPlanId !== lessonPlanId) {
      throw new NotFoundException('Không tìm thấy hoạt động');
    }

    const description =
      dto.description ||
      `Mục tiêu: ${activity.objective || ''}\nHoạt động GV: ${activity.teacherActivity || ''}\nHoạt động HS: ${activity.studentActivity || ''}`;

    const saved = await this.prisma.teachingActivity.create({
      data: {
        teacherId,
        title: dto.title || activity.title,
        description,
        typeName: dto.typeName || activity.phase || 'Khác',
        subjectName: dto.subject || 'Toán',
        gradeName: dto.grade || 'Lớp 4',
        durationMinutes: dto.durationMinutes || activity.durationMinutes,
        objective: activity.objective || null,
        method: activity.method || null,
        technique: activity.technique || null,
        competencies: activity.competencies || null,
        qualities: activity.qualities || null,
        equipment: activity.equipment || null,
        teacherActivity: activity.teacherActivity || null,
        studentActivity: activity.studentActivity || null,
        icon: dto.icon || 'Grid2X2',
        isPublic: false,
      },
    });

    return {
      success: true,
      message: 'Đã lưu hoạt động vào thư viện cá nhân thành công',
      activity: saved,
    };
  }

  async getVersions(lessonPlanId: string, teacherId: string) {
    await this.findOne(lessonPlanId, teacherId);

    const versions = await this.prisma.lessonPlanVersion.findMany({
      where: { lessonPlanId },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        title: true,
        changeSummary: true,
        createdAt: true,
      },
    });

    return versions;
  }

  async restoreVersion(lessonPlanId: string, versionId: string, teacherId: string) {
    const existing = await this.findOne(lessonPlanId, teacherId);

    const versionRecord = await this.prisma.lessonPlanVersion.findUnique({
      where: { id: versionId },
    });

    if (!versionRecord || versionRecord.lessonPlanId !== lessonPlanId) {
      throw new NotFoundException('Không tìm thấy phiên bản giáo án');
    }

    const snapshot = JSON.parse(versionRecord.contentSnapshot);

    return this.prisma.$transaction(async (tx) => {
      const nextVersion = existing.version + 1;

      await tx.lessonPlan.update({
        where: { id: lessonPlanId },
        data: {
          title: snapshot.title || existing.title,
          topic: snapshot.topic || existing.topic,
          durationMinutes: snapshot.duration || existing.duration,
          objectives: snapshot.objective || existing.objective,
          specificCompetencies: snapshot.specificCompetencies,
          generalCompetencies: snapshot.generalCompetencies,
          qualities: snapshot.qualities,
          teachingEquipment: snapshot.teachingEquipment,
          postLessonAdjustment: snapshot.postLessonAdjustment,
          notes: snapshot.notes,
          version: nextVersion,
        },
      });

      if (snapshot.activities && Array.isArray(snapshot.activities)) {
        await tx.lessonPlanActivity.deleteMany({
          where: { lessonPlanId },
        });

        await Promise.all(
          snapshot.activities.map((act: any, index: number) =>
            tx.lessonPlanActivity.create({
              data: {
                lessonPlanId,
                phase: act.phase || 'Hoạt động',
                title: act.title,
                durationMinutes: act.minutes || 5,
                method: act.method || '',
                technique: act.technique || '',
                competencies: act.competencies || '',
                qualities: act.qualities || '',
                equipment: act.equipment || null,
                objective: act.objective || '',
                teacherActivity: act.teacher || '',
                studentActivity: act.students || '',
                sortOrder: index,
              },
            }),
          ),
        );
      }

      // Record restoration snapshot
      await tx.lessonPlanVersion.create({
        data: {
          lessonPlanId,
          versionNumber: nextVersion,
          title: snapshot.title || existing.title,
          contentSnapshot: versionRecord.contentSnapshot,
          changeSummary: `Khôi phục từ phiên bản v${versionRecord.versionNumber}`,
          createdById: teacherId,
        },
      });

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'LESSON_PLAN_RESTORE',
        resourceType: 'LessonPlan',
        resourceId: lessonPlanId,
        details: { restoredFromVersion: versionRecord.versionNumber, newVersion: nextVersion },
      });

      return this.findOne(lessonPlanId, teacherId);
    });
  }

  async linkSchedule(lessonPlanId: string, scheduleId: string, teacherId: string) {
    await this.findOne(lessonPlanId, teacherId);

    const sched = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!sched || sched.deletedAt || sched.teacherId !== teacherId) {
      throw new ForbiddenException('Lịch dạy không tồn tại hoặc không thuộc quyền sở hữu của bạn');
    }

    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { lessonPlanId },
    });

    return this.findOne(lessonPlanId, teacherId);
  }

  async unlinkSchedule(lessonPlanId: string, scheduleId: string, teacherId: string) {
    await this.findOne(lessonPlanId, teacherId);

    const sched = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!sched || sched.deletedAt || sched.teacherId !== teacherId) {
      throw new ForbiddenException('Lịch dạy không tồn tại hoặc không thuộc quyền sở hữu của bạn');
    }

    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { lessonPlanId: null },
    });

    return this.findOne(lessonPlanId, teacherId);
  }

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

  async attachHtmlGame(lessonPlanId: string, htmlGameId: string, teacherId?: string) {
    if (!teacherId) {
      throw new ForbiddenException('Chỉ giáo viên mới có thể gắn trò chơi vào giáo án');
    }
    await this.findOne(lessonPlanId, teacherId);

    const game = await this.prisma.htmlGame.findFirst({
      where: {
        id: htmlGameId,
        status: 'PUBLISHED',
      },
      include: {
        subject: true,
        grade: true,
      },
    });
    if (!game) {
      throw new NotFoundException('Không tìm thấy trò chơi đã xuất bản');
    }

    const link = await this.prisma.lessonPlanHtmlGame.upsert({
      where: {
        lessonPlanId_htmlGameId: {
          lessonPlanId,
          htmlGameId,
        },
      },
      update: {},
      create: {
        lessonPlanId,
        htmlGameId,
      },
      include: {
        htmlGame: {
          include: {
            subject: true,
            grade: true,
          },
        },
      },
    });
    return this.mapAttachedHtmlGame(link.htmlGame);
  }

  async detachHtmlGame(lessonPlanId: string, htmlGameId: string, teacherId?: string) {
    if (!teacherId) {
      throw new ForbiddenException('Chỉ giáo viên mới có thể gỡ trò chơi khỏi giáo án');
    }
    await this.findOne(lessonPlanId, teacherId);
    await this.prisma.lessonPlanHtmlGame.deleteMany({
      where: { lessonPlanId, htmlGameId },
    });
    return { success: true, message: 'Đã gỡ trò chơi khỏi giáo án' };
  }

  async getAttachedHtmlGames(lessonPlanId: string, teacherId?: string) {
    if (!teacherId) {
      throw new ForbiddenException('Chỉ giáo viên mới có thể xem trò chơi của giáo án');
    }
    await this.findOne(lessonPlanId, teacherId);
    const links = await this.prisma.lessonPlanHtmlGame.findMany({
      where: {
        lessonPlanId,
        htmlGame: { status: 'PUBLISHED' },
      },
      include: {
        htmlGame: {
          include: {
            subject: true,
            grade: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((link) => this.mapAttachedHtmlGame(link.htmlGame));
  }

  private mapLessonPlanSummary(plan: any) {
    return {
      id: plan.id,
      title: plan.title,
      topic: plan.topic || null,
      subject: plan.subjectName || plan.subject?.name || 'Toán',
      grade: plan.gradeName || plan.classroom?.name || 'Lớp 4A',
      date: plan.teachingDate ? new Date(plan.teachingDate).toISOString().split('T')[0] : null,
      duration: plan.durationMinutes || 40,
      status: plan.status || 'DRAFT',
      sourceType: plan.sourceType || 'NATIVE',
      originalFileName: plan.originalFileName || null,
      mimeType: plan.mimeType || null,
      fileSize: plan.fileSize || null,
      version: plan.version || 1,
      activitiesCount: (plan.activities || []).length,
      schedulesCount: (plan.schedules || []).length,
      schedules: plan.schedules || [],
      updatedAt: plan.updatedAt,
      createdAt: plan.createdAt,
    };
  }

  private mapLessonPlanDetail(plan: any) {
    const activities = (plan.activities || []).map((a: any) => this.mapActivity(a));
    const resources = (plan.resources || []).map((r: any) => this.mapAttachedResource(r.resource));
    const htmlGames = (plan.htmlGames || []).map((link: any) =>
      this.mapAttachedHtmlGame(link.htmlGame),
    );
    return {
      id: plan.id,
      title: plan.title,
      topic: plan.topic || '',
      subject: plan.subjectName || plan.subject?.name || 'Toán',
      grade: plan.gradeName || plan.classroom?.name || 'Lớp 4A',
      classroomId: plan.classroomId || null,
      subjectId: plan.subjectId || null,
      date: plan.teachingDate ? new Date(plan.teachingDate).toISOString().split('T')[0] : '2026-08-21',
      duration: plan.durationMinutes || 40,
      objective: plan.objectives || '',
      specificCompetencies: plan.specificCompetencies || '',
      generalCompetencies: plan.generalCompetencies || '',
      qualities: plan.qualities || '',
      teachingEquipment: plan.teachingEquipment || '',
      postLessonAdjustment: plan.postLessonAdjustment || '',
      notes: plan.notes || '',
      status: plan.status || 'DRAFT',
      sourceType: plan.sourceType || 'NATIVE',
      originalFileName: plan.originalFileName || null,
      storedFileName: plan.storedFileName || null,
      storagePath: plan.storagePath || null,
      mimeType: plan.mimeType || null,
      fileSize: plan.fileSize || null,
      version: plan.version || 1,
      activities,
      resources,
      htmlGames,
      schedules: plan.schedules || [],
      versions: plan.versions || [],
      updatedAt: plan.updatedAt,
      createdAt: plan.createdAt,
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

  private mapAttachedHtmlGame(game: any) {
    if (!game) return null;
    return {
      id: game.id,
      title: game.title,
      description: game.description,
      thumbnail: game.thumbnail,
      gradeId: game.gradeId,
      grade: game.grade || null,
      subjectId: game.subjectId,
      subject: game.subject || null,
      status: game.status,
      updatedAt: game.updatedAt,
    };
  }

  private mapPhaseToActivityType(phase?: string): string {
    const raw = String(phase || '').toUpperCase();
    if (raw.includes('WARM') || raw.includes('KHỞI') || raw.includes('KHOI')) return 'WARM_UP';
    if (raw.includes('EXPLORE') || raw.includes('KHÁM') || raw.includes('KHAM')) return 'EXPLORE';
    if (raw.includes('PRACTICE') || raw.includes('LUYỆN') || raw.includes('LUYEN')) return 'PRACTICE';
    if (raw.includes('APPLY') || raw.includes('APPLICATION') || raw.includes('VẬN') || raw.includes('VAN')) {
      return 'APPLICATION';
    }
    return 'OTHER';
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
      equipment: act.equipment || '',
      objective: act.objective || '',
      teacher: act.teacherActivity || '',
      students: act.studentActivity || '',
      sortOrder: act.sortOrder || 0,
    };
  }
}
