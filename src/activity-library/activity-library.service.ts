import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLibraryActivityDto } from './dto/create-activity.dto';
import { UpdateLibraryActivityDto } from './dto/update-activity.dto';

@Injectable()
export class ActivityLibraryService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { subject?: string; grade?: string; type?: string; keyword?: string }) {
    const { subject, grade, type, keyword } = query;
    const where: any = {
      deletedAt: null,
      isPublic: true,
    };

    if (subject && subject !== 'Tất cả') {
      where.OR = [
        { subjectName: { contains: subject, mode: 'insensitive' } },
        { subject: { name: { contains: subject, mode: 'insensitive' } } },
      ];
    }

    if (grade && grade !== 'Tất cả') {
      where.gradeName = { contains: grade, mode: 'insensitive' };
    }

    if (type && type !== 'Tất cả') {
      where.typeName = { contains: type, mode: 'insensitive' };
    }

    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const activities = await this.prisma.teachingActivity.findMany({
      where,
      orderBy: { usesCount: 'desc' },
    });

    if (activities.length === 0) {
      return [
        { id: 'act-1', title: 'Bingo phân số', subject: 'Toán', grade: 'Lớp 4', type: 'Trò chơi', uses: 128, icon: 'Grid2X2' },
        { id: 'act-2', title: 'Chiếc hộp bí mật', subject: 'Tiếng Việt', grade: 'Lớp 3-5', type: 'Khởi động', uses: 96, icon: 'Gift' },
        { id: 'act-3', title: 'Nhà khoa học nhí', subject: 'Khoa học', grade: 'Lớp 4', type: 'Khám phá', uses: 74, icon: 'FlaskConical' },
      ];
    }

    return activities.map((a) => this.mapLibraryActivity(a));
  }

  async findOne(id: string) {
    const activity = await this.prisma.teachingActivity.findUnique({
      where: { id },
      include: { teacher: true, subject: true, grade: true },
    });

    if (!activity || activity.deletedAt) {
      throw new NotFoundException(`Không tìm thấy hoạt động ${id}`);
    }

    return this.mapLibraryActivity(activity);
  }

  async create(dto: CreateLibraryActivityDto, teacherId?: string) {
    const activity = await this.prisma.teachingActivity.create({
      data: {
        teacherId,
        title: dto.title,
        subjectName: dto.subject || 'Toán',
        gradeName: dto.grade || 'Lớp 4',
        typeName: dto.type || 'Trò chơi',
        description: dto.description,
        durationMinutes: dto.durationMinutes || 10,
        icon: dto.icon || 'Grid2X2',
        isPublic: dto.isPublic !== undefined ? dto.isPublic : true,
      },
    });

    return this.mapLibraryActivity(activity);
  }

  async update(id: string, dto: UpdateLibraryActivityDto, teacherId?: string) {
    const existing = await this.findOne(id);
    if (!existing.teacherId || existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa hoạt động này');
    }

    const updated = await this.prisma.teachingActivity.update({
      where: { id },
      data: {
        title: dto.title,
        subjectName: dto.subject,
        gradeName: dto.grade,
        typeName: dto.type,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        icon: dto.icon,
        isPublic: dto.isPublic,
      },
    });

    return this.mapLibraryActivity(updated);
  }

  async remove(id: string, teacherId?: string) {
    const existing = await this.findOne(id);
    if (!existing.teacherId || existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa hoạt động này');
    }

    await this.prisma.teachingActivity.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Đã xóa hoạt động' };
  }

  async addToLessonPlan(activityId: string, lessonPlanId: string, teacherId: string) {
    const activity = await this.findOne(activityId);

    const lessonPlan = await this.prisma.lessonPlan.findUnique({
      where: { id: lessonPlanId },
    });

    if (!lessonPlan || lessonPlan.deletedAt) {
      throw new NotFoundException('Không tìm thấy giáo án mục tiêu');
    }

    if (lessonPlan.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa giáo án này');
    }

    const count = await this.prisma.lessonPlanActivity.count({
      where: { lessonPlanId },
    });

    const newActivity = await this.prisma.lessonPlanActivity.create({
      data: {
        lessonPlanId,
        phase: activity.type || 'Hoạt động',
        title: activity.title,
        durationMinutes: activity.durationMinutes || 10,
        objective: activity.description || '',
        teacherActivity: `GV tổ chức hoạt động ${activity.title} cho học sinh.`,
        studentActivity: `HS tham gia hoạt động ${activity.title} theo hướng dẫn.`,
        sortOrder: count,
      },
    });

    // Increment usesCount
    await this.prisma.teachingActivity.update({
      where: { id: activityId },
      data: { usesCount: { increment: 1 } },
    });

    return newActivity;
  }

  private mapLibraryActivity(a: any) {
    return {
      id: a.id,
      teacherId: a.teacherId,
      title: a.title,
      subject: a.subjectName || a.subject?.name || 'Toán',
      grade: a.gradeName || a.grade?.name || 'Lớp 4',
      type: a.typeName || 'Trò chơi',
      description: a.description || '',
      durationMinutes: a.durationMinutes || 10,
      uses: a.usesCount || 0,
      icon: a.icon || 'Grid2X2',
    };
  }
}
