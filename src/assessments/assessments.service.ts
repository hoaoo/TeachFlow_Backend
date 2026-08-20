import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto, BulkStudentAssessmentDto } from './dto/bulk-student-assessment.dto';

@Injectable()
export class AssessmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(teacherId?: string) {
    const where: any = { deletedAt: null };
    if (teacherId) {
      where.teacherId = teacherId;
    }

    const list = await this.prisma.assessment.findMany({
      where,
      include: {
        classroom: true,
        subject: true,
        criteria: { orderBy: { sortOrder: 'asc' } },
        studentAssessments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((a) => this.mapAssessment(a));
  }

  async findOne(id: string, teacherId?: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        classroom: {
          include: {
            classStudents: {
              where: { status: 'ACTIVE', student: { deletedAt: null } },
              include: { student: true },
            },
          },
        },
        subject: true,
        criteria: { orderBy: { sortOrder: 'asc' } },
        studentAssessments: {
          include: { student: true, criterion: true },
        },
      },
    });

    if (!assessment || assessment.deletedAt) {
      throw new NotFoundException(`Không tìm thấy đánh giá ${id}`);
    }

    if (teacherId && assessment.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập đánh giá này');
    }

    return this.mapAssessmentDetail(assessment);
  }

  async create(dto: CreateAssessmentDto, teacherId: string) {
    let classroomId = dto.classroomId;
    if (classroomId) {
      const cls = await this.prisma.classroom.findUnique({
        where: { id: classroomId },
      });
      if (!cls || cls.deletedAt || cls.teacherId !== teacherId) {
        throw new ForbiddenException('Bạn không có quyền tạo đánh giá cho lớp học này');
      }
    } else {
      const cls = await this.prisma.classroom.findFirst({
        where: { teacherId, deletedAt: null },
      });
      classroomId = cls?.id;
    }

    if (!classroomId) {
      const sy = await this.prisma.schoolYear.findFirst() || await this.prisma.schoolYear.create({
        data: { name: '2026 - 2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-05-31') },
      });
      const grade = await this.prisma.grade.findFirst() || await this.prisma.grade.create({
        data: { name: 'Khối 4', level: 4 },
      });
      const cls = await this.prisma.classroom.create({
        data: { name: 'Lớp 4A', gradeId: grade.id, schoolYearId: sy.id, teacherId },
      });
      classroomId = cls.id;
    }

    const assessment = await this.prisma.assessment.create({
      data: {
        teacherId,
        classroomId,
        subjectId: dto.subjectId,
        title: dto.title,
        subtitle: dto.subtitle || 'Toán · Lớp 4A',
        status: dto.status || 'Đang thực hiện',
        meta: dto.meta || '32 học sinh',
        tone: dto.tone || 'teal',
        version: 1,
        criteria: dto.criteria?.length
          ? {
              create: dto.criteria.map((c, index) => ({
                code: c.code,
                name: c.name,
                sortOrder: index,
              })),
            }
          : undefined,
      },
      include: {
        classroom: true,
        subject: true,
        criteria: true,
        studentAssessments: true,
      },
    });

    return this.mapAssessment(assessment);
  }

  async update(id: string, dto: UpdateAssessmentDto, teacherId: string) {
    const existing = await this.prisma.assessment.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa đánh giá này');
    }

    if (dto.version !== undefined && dto.version !== existing.version) {
      throw new ConflictException('Dữ liệu đánh giá đã thay đổi bởi phiên khác.');
    }

    const updated = await this.prisma.assessment.update({
      where: { id, version: existing.version },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        status: dto.status,
        meta: dto.meta,
        tone: dto.tone,
        version: existing.version + 1,
      },
      include: {
        classroom: true,
        subject: true,
        criteria: true,
        studentAssessments: true,
      },
    });

    return this.mapAssessment(updated);
  }

  async remove(id: string, teacherId: string) {
    const existing = await this.prisma.assessment.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa đánh giá này');
    }

    await this.prisma.assessment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Đã xóa đánh giá' };
  }

  async bulkUpdateStudents(id: string, dto: BulkStudentAssessmentDto, teacherId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        classroom: {
          include: {
            classStudents: {
              where: { status: 'ACTIVE' },
              select: { studentId: true },
            },
          },
        },
      },
    });

    if (!assessment || assessment.deletedAt) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    if (assessment.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chấm đánh giá này');
    }

    const validStudentIds = new Set(
      assessment.classroom.classStudents.map((cs) => cs.studentId),
    );

    for (const item of dto.assessments) {
      if (!validStudentIds.has(item.studentId)) {
        throw new BadRequestException(
          `Học sinh với ID ${item.studentId} không thuộc lớp học của đánh giá này`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.assessments) {
        const existing = await tx.studentAssessment.findFirst({
          where: {
            assessmentId: id,
            studentId: item.studentId,
            assessmentCriterionId: item.criterionId || null,
          },
        });

        if (existing) {
          await tx.studentAssessment.update({
            where: { id: existing.id },
            data: {
              level: (item.level as any) || 'COMPLETED',
              score: item.score,
              comment: item.comment,
            },
          });
        } else {
          await tx.studentAssessment.create({
            data: {
              assessmentId: id,
              studentId: item.studentId,
              assessmentCriterionId: item.criterionId,
              level: (item.level as any) || 'COMPLETED',
              score: item.score,
              comment: item.comment,
            },
          });
        }
      }

      return { success: true, message: 'Lưu đánh giá học sinh thành công' };
    });
  }

  private mapAssessment(a: any) {
    return {
      id: a.id,
      title: a.title,
      subtitle: a.subtitle || `${a.subject?.name || 'Toán'} · ${a.classroom?.name || 'Lớp 4A'}`,
      status: a.status || 'Đang thực hiện',
      meta: a.meta || `${a.studentAssessments?.length || 0} học sinh`,
      tone: a.tone || 'teal',
      version: a.version,
    };
  }

  private mapAssessmentDetail(a: any) {
    return {
      ...this.mapAssessment(a),
      criteria: a.criteria || [],
      studentAssessments: a.studentAssessments || [],
    };
  }
}
