import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto, BulkStudentAssessmentDto } from './dto/bulk-student-assessment.dto';

@Injectable()
export class AssessmentsService {
  constructor(
    private prisma: PrismaService,
    private assignmentAuth: TeachingAssignmentAuthorizationService,
  ) {}

  async findAll(teacherId?: string) {
    const where: any = { deletedAt: null };
    if (teacherId) {
      where.OR = [
        { teacherId },
        { teachingAssignment: { teacherId } },
      ];
    }

    const list = await this.prisma.assessment.findMany({
      where,
      include: {
        classroom: true,
        subject: true,
        schoolYear: true,
        teachingAssignment: {
          include: {
            subject: true,
            classroom: { include: { grade: true } },
            schoolYear: true,
          },
        },
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
        classroom: true,
        subject: true,
        schoolYear: true,
        teachingAssignment: {
          include: {
            subject: true,
            classroom: { include: { grade: true } },
            schoolYear: true,
          },
        },
        criteria: { orderBy: { sortOrder: 'asc' } },
        studentAssessments: {
          include: { student: true, criterion: true },
        },
      },
    });

    if (!assessment || assessment.deletedAt) {
      throw new NotFoundException(`Không tìm thấy đánh giá ${id}`);
    }

    const ownerTeacherId = assessment.teachingAssignment?.teacherId || assessment.teacherId;
    if (teacherId && ownerTeacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập đánh giá này');
    }

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        classroomId: assessment.classroomId,
        status: { in: ['ACTIVE', 'COMPLETED', 'TRANSFERRED'] },
        student: { deletedAt: null },
      },
      include: { student: true },
      orderBy: { student: { fullName: 'asc' } },
    });

    return this.mapAssessmentDetail(assessment, enrollments.map((e) => e.student));
  }

  async create(dto: CreateAssessmentDto, teacherId: string) {
    let assignmentId: string | null = null;
    let effectiveClassroomId = dto.classroomId;
    let effectiveSubjectId = dto.subjectId;
    let effectiveSchoolYearId = dto.schoolYearId;
    let effectiveSubtitle = dto.subtitle;

    if (dto.teachingAssignmentId) {
      const asg = await this.assignmentAuth.validateAssignmentForCreate(
        dto.teachingAssignmentId,
        teacherId,
      );
      assignmentId = asg.id;
      effectiveClassroomId = asg.classroomId;
      effectiveSubjectId = asg.subjectId;
      effectiveSchoolYearId = asg.schoolYearId;
      effectiveSubtitle = `${asg.subject?.name || 'Môn học'} · ${asg.classroom?.name || 'Lớp'}`;
    } else if (dto.classroomId) {
      const cls = await this.prisma.classroom.findUnique({
        where: { id: dto.classroomId },
        include: {
          teachingAssignments: {
            where: { teacherId, isActive: true },
            include: { subject: true },
          },
        },
      });
      if (!cls || cls.deletedAt) {
        throw new NotFoundException(`Không tìm thấy lớp học với mã ${dto.classroomId}`);
      }
      const isHomeroom = cls.teacherId === teacherId;
      const hasAssignment = cls.teachingAssignments && cls.teachingAssignments.length > 0;
      if (!isHomeroom && !hasAssignment) {
        throw new ForbiddenException('Bạn không có quyền tạo đánh giá cho lớp học này');
      }

      const matchingAsg = dto.subjectId
        ? cls.teachingAssignments?.find((a) => a.subjectId === dto.subjectId)
        : cls.teachingAssignments?.[0];

      if (matchingAsg) {
        assignmentId = matchingAsg.id;
        effectiveSubjectId = matchingAsg.subjectId;
        effectiveSchoolYearId = matchingAsg.schoolYearId;
        effectiveSubtitle = `${matchingAsg.subject?.name || 'Môn học'} · ${cls.name}`;
      } else {
        effectiveSchoolYearId = cls.schoolYearId;
      }
    }

    if (!effectiveClassroomId) {
      const sy = (await this.prisma.schoolYear.findFirst()) || (await this.prisma.schoolYear.create({
        data: { name: '2026 - 2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-05-31') },
      }));
      const grade = (await this.prisma.grade.findFirst()) || (await this.prisma.grade.create({
        data: { name: 'Khối 4', level: 4 },
      }));
      const cls = await this.prisma.classroom.create({
        data: { code: '4A', name: 'Lớp 4A', gradeId: grade.id, schoolYearId: sy.id, teacherId },
      });
      effectiveClassroomId = cls.id;
      effectiveSchoolYearId = sy.id;
    }

    if (effectiveSchoolYearId && this.prisma.schoolYear) {
      const sy = await this.prisma.schoolYear.findUnique({
        where: { id: effectiveSchoolYearId },
      });
      if (sy && !sy.isActive) {
        throw new BadRequestException('Không thể tạo đánh giá cho năm học đã ngừng hoạt động');
      }
    }

    const assessment = await this.prisma.assessment.create({
      data: {
        teacherId,
        teachingAssignmentId: assignmentId,
        classroomId: effectiveClassroomId,
        subjectId: effectiveSubjectId,
        schoolYearId: effectiveSchoolYearId,
        title: dto.title,
        subtitle: effectiveSubtitle || 'Toán · Lớp 4A',
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
    const existing = await this.prisma.assessment.findUnique({
      where: { id },
      include: { teachingAssignment: true },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    const ownerTeacherId = existing.teachingAssignment?.teacherId || existing.teacherId;
    if (ownerTeacherId !== teacherId) {
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
    const existing = await this.prisma.assessment.findUnique({
      where: { id },
      include: { teachingAssignment: true },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    const ownerTeacherId = existing.teachingAssignment?.teacherId || existing.teacherId;
    if (ownerTeacherId !== teacherId) {
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
        teachingAssignment: true,
        criteria: true,
      },
    });

    if (!assessment || assessment.deletedAt) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    const ownerTeacherId = assessment.teachingAssignment?.teacherId || assessment.teacherId;
    if (ownerTeacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chấm đánh giá này');
    }

    // Validate score bounds
    for (const item of dto.assessments) {
      if (item.score !== undefined && item.score !== null && (item.score < 0 || item.score > 10)) {
        throw new BadRequestException('Điểm số phải nằm trong thang điểm từ 0 đến 10');
      }
    }

    // Validate student enrollment membership
    await this.assignmentAuth.assertStudentsEnrolled(
      assessment.classroomId,
      dto.assessments.map((a) => a.studentId),
    );

    // Validate nested criterion ID ownership
    const validCriterionIds = new Set(assessment.criteria.map((c) => c.id));
    for (const item of dto.assessments) {
      if (item.criterionId && !validCriterionIds.has(item.criterionId)) {
        throw new BadRequestException('Tiêu chí đánh giá không thuộc bài đánh giá này');
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
      teachingAssignmentId: a.teachingAssignmentId,
      classroomId: a.classroomId,
      subjectId: a.subjectId,
      schoolYearId: a.schoolYearId,
    };
  }

  private mapAssessmentDetail(a: any, students?: any[]) {
    return {
      ...this.mapAssessment(a),
      criteria: a.criteria || [],
      studentAssessments: a.studentAssessments || [],
      students: students || [],
    };
  }
}
