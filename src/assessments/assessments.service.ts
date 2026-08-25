import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { AcademicCalculationService } from './academic-calculation.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import {
  UpdateAssessmentDto,
  BulkStudentAssessmentDto,
  BatchSaveAssessmentScoresDto,
  StudentAssessmentItemDto,
  AssessmentLevelEnum,
} from './dto/bulk-student-assessment.dto';
import { GradebookQueryDto } from './dto/gradebook-query.dto';
import { ImportGradebookScoresDto } from './dto/import-gradebook-scores.dto';
import { QuickAssessmentDto } from './dto/quick-assessment.dto';
import { AuditService } from '../common/audit/audit.service';

@Injectable()
export class AssessmentsService {
  private academicCalc: AcademicCalculationService;

  constructor(
    private prisma: PrismaService,
    private assignmentAuth: TeachingAssignmentAuthorizationService,
    @Optional() academicCalc?: AcademicCalculationService,
    @Optional() private auditService?: AuditService,
  ) {
    this.academicCalc = academicCalc || new AcademicCalculationService();
  }

  /**
   * Helper: Get accessible classroom IDs for a given teacher
   */
  private async getTeacherAccessibleClassroomIds(teacherId: string): Promise<string[]> {
    try {
      const [homeroomClasses, assignedClasses] = await Promise.all([
        this.prisma.classroom?.findMany
          ? this.prisma.classroom.findMany({
              where: { teacherId, deletedAt: null },
              select: { id: true },
            })
          : [],
        this.prisma.teachingAssignment?.findMany
          ? this.prisma.teachingAssignment.findMany({
              where: { teacherId, isActive: true },
              select: { classroomId: true },
            })
          : [],
      ]);

      const ids = new Set<string>();
      (homeroomClasses || []).forEach((c: any) => {
        if (c && c.id) ids.add(c.id);
      });
      (assignedClasses || []).forEach((a: any) => {
        if (a && a.classroomId) ids.add(a.classroomId);
      });

      return Array.from(ids);
    } catch {
      return [];
    }
  }

  async findAll(teacherId?: string, classroomId?: string, subjectId?: string, semester?: number) {
    const where: any = { deletedAt: null };

    if (teacherId) {
      // Assessments are teacher-owned records; classroom access alone is not enough.
      where.teacherId = teacherId;
    }

    if (classroomId && classroomId !== 'ALL') {
      where.classroomId = classroomId;
    }
    if (subjectId && subjectId !== 'ALL') {
      where.subjectId = subjectId;
    }
    if (semester) {
      where.semester = semester;
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
      orderBy: [{ assessmentDate: 'desc' }, { createdAt: 'desc' }],
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

    if (teacherId && assessment.teacherId !== teacherId) {
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
      const teacherClass = await this.prisma.classroom.findFirst({
        where: { teacherId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (teacherClass) {
        effectiveClassroomId = teacherClass.id;
        effectiveSchoolYearId = teacherClass.schoolYearId;
      } else {
        throw new BadRequestException('Vui lòng chọn hoặc tạo lớp học trước khi tạo bài đánh giá');
      }
    }

    if (effectiveSchoolYearId && this.prisma.schoolYear) {
      const sy = await this.prisma.schoolYear.findUnique({
        where: { id: effectiveSchoolYearId },
      });
      if (sy && !sy.isActive) {
        throw new BadRequestException('Không thể tạo đánh giá cho năm học đã ngừng hoạt động');
      }
    }

    const existing = this.prisma.assessment.findFirst
      ? await this.prisma.assessment.findFirst({
          where: {
            classroomId: effectiveClassroomId,
            subjectId: effectiveSubjectId || undefined,
            semester: dto.semester || 1,
            title: dto.title.trim(),
            deletedAt: null,
          },
        })
      : null;
    if (existing) {
      throw new ConflictException(`Đánh giá "${dto.title.trim()}" đã tồn tại trong lớp học này`);
    }

    // Build meta string containing type & weight if provided
    const assessmentType = dto.assessmentType || 'THUONG_XUYEN';
    const weight = dto.weight || this.academicCalc.getWeight(assessmentType);
    const metaObj = {
      type: assessmentType,
      weight,
      meta: dto.meta || '0 học sinh',
    };

    const assessment = await this.prisma.assessment.create({
      data: {
        teacherId,
        teachingAssignmentId: assignmentId,
        classroomId: effectiveClassroomId,
        subjectId: effectiveSubjectId,
        schoolYearId: effectiveSchoolYearId,
        semester: dto.semester || 1,
        assessmentDate: dto.assessmentDate ? new Date(dto.assessmentDate) : new Date(),
        title: dto.title.trim(),
        subtitle: effectiveSubtitle || 'Toán · Lớp học',
        status: dto.status || 'IN_PROGRESS',
        meta: JSON.stringify(metaObj),
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

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'ASSESSMENT_CREATE',
      resourceType: 'Assessment',
      resourceId: assessment.id,
      details: { title: assessment.title, classroomId: effectiveClassroomId, subjectId: effectiveSubjectId },
    });

    return this.mapAssessment(assessment);
  }

  async createQuickAssessment(dto: QuickAssessmentDto, teacherId: string) {
    const accessibleClassIds = await this.getTeacherAccessibleClassroomIds(teacherId);
    if (!accessibleClassIds.includes(dto.classroomId)) {
      throw new ForbiddenException('Bạn không có quyền đánh giá học sinh trong lớp học này');
    }

    const classroom = await this.prisma.classroom.findUnique({
      where: { id: dto.classroomId },
      include: { schoolYear: true },
    });
    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException('Không tìm thấy lớp học');
    }

    // Find or create assessment record for this title and class
    let assessment = await this.prisma.assessment.findFirst({
      where: {
        teacherId,
        classroomId: dto.classroomId,
        title: dto.title.trim(),
        subjectId: dto.subjectId || undefined,
        deletedAt: null,
      },
    });

    if (!assessment) {
      assessment = await this.prisma.assessment.create({
        data: {
          teacherId,
          classroomId: dto.classroomId,
          subjectId: dto.subjectId || null,
          schoolYearId: classroom.schoolYearId,
          title: dto.title.trim(),
          semester: dto.semester || 1,
          assessmentDate: dto.assessmentDate ? new Date(dto.assessmentDate) : new Date(),
          status: 'COMPLETED',
        },
      });
    }

    const effectiveLevel =
      dto.level ||
      (dto.score !== undefined
        ? dto.score >= 9
          ? AssessmentLevelEnum.EXCELLENT
          : dto.score >= 5
          ? AssessmentLevelEnum.COMPLETED
          : AssessmentLevelEnum.NEEDS_SUPPORT
        : AssessmentLevelEnum.COMPLETED);

    // Record for each student
    for (const studentId of dto.studentIds) {
      const isEnrolled = await this.prisma.studentEnrollment.findFirst({
        where: { studentId, classroomId: dto.classroomId, status: 'ACTIVE' },
      });
      if (!isEnrolled) {
        continue;
      }

      const existingRecord = await this.prisma.studentAssessment.findFirst({
        where: { assessmentId: assessment.id, studentId },
      });

      if (existingRecord) {
        await this.prisma.studentAssessment.update({
          where: { id: existingRecord.id },
          data: {
            level: effectiveLevel,
            score: dto.score !== undefined ? dto.score : existingRecord.score,
            comment: dto.comment !== undefined ? dto.comment : existingRecord.comment,
          },
        });
      } else {
        await this.prisma.studentAssessment.create({
          data: {
            assessmentId: assessment.id,
            studentId,
            level: effectiveLevel,
            score: dto.score,
            comment: dto.comment,
          },
        });
      }

      if (dto.comment && dto.comment.trim()) {
        await this.prisma.studentComment.create({
          data: {
            studentId,
            teacherId,
            classroomId: dto.classroomId,
            subjectId: dto.subjectId || null,
            content: `[${dto.title}] ${dto.comment.trim()}`,
          },
        });
      }

      // If marked as NEEDS_SUPPORT, update student status
      if (effectiveLevel === AssessmentLevelEnum.NEEDS_SUPPORT) {
        await this.prisma.student.update({
          where: { id: studentId },
          data: { status: 'NEEDS_SUPPORT' },
        });
      } else if (effectiveLevel === AssessmentLevelEnum.EXCELLENT) {
        await this.prisma.student.update({
          where: { id: studentId },
          data: { status: 'EXCELLENT' },
        });
      }
    }

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'QUICK_ASSESSMENT_CREATE',
      resourceType: 'Assessment',
      resourceId: assessment.id,
      details: { title: assessment.title, studentCount: dto.studentIds.length, classroomId: dto.classroomId },
    });

    return {
      success: true,
      assessmentId: assessment.id,
      assessmentTitle: assessment.title,
      updatedStudentsCount: dto.studentIds.length,
      message: `Đã lưu đánh giá cho ${dto.studentIds.length} học sinh thành công`,
    };
  }

  async update(id: string, dto: UpdateAssessmentDto, teacherId: string) {
    const existing = await this.prisma.assessment.findUnique({
      where: { id },
      include: { teachingAssignment: true },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền thao tác với đánh giá này');
    }

    if (dto.version !== undefined && dto.version !== existing.version) {
      throw new ConflictException('Dữ liệu đánh giá đã thay đổi bởi phiên khác.');
    }

    let metaString = dto.meta;
    if (dto.assessmentType || dto.weight) {
      let currentMeta: any = {};
      try {
        currentMeta = existing.meta ? JSON.parse(existing.meta) : {};
      } catch {
        currentMeta = { meta: existing.meta };
      }
      if (dto.assessmentType) currentMeta.type = dto.assessmentType;
      if (dto.weight) currentMeta.weight = dto.weight;
      metaString = JSON.stringify(currentMeta);
    }

    const updated = await this.prisma.assessment.update({
      where: { id, version: existing.version },
      data: {
        title: dto.title?.trim(),
        subtitle: dto.subtitle,
        status: dto.status,
        meta: metaString,
        tone: dto.tone,
        semester: dto.semester,
        assessmentDate: dto.assessmentDate ? new Date(dto.assessmentDate) : undefined,
        version: existing.version + 1,
      },
      include: {
        classroom: true,
        subject: true,
        criteria: true,
        studentAssessments: true,
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'ASSESSMENT_UPDATE',
      resourceType: 'Assessment',
      resourceId: id,
      details: { title: updated.title },
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

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền thao tác với đánh giá này');
    }

    await this.prisma.assessment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'ASSESSMENT_DELETE',
      resourceType: 'Assessment',
      resourceId: id,
      details: { title: existing.title },
    });

    return { success: true, message: 'Đã xóa đánh giá' };
  }

  /**
   * Classroom Gradebook Matrix
   */
  async getGradebook(query: GradebookQueryDto, teacherId?: string) {
    const { classroomId, subjectId, semester = 1, schoolYearId } = query;

    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: { grade: true, schoolYear: true },
    });
    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException('Không tìm thấy lớp học');
    }

    if (teacherId) {
      const accessibleClassIds = await this.getTeacherAccessibleClassroomIds(teacherId);
      if (!accessibleClassIds.includes(classroomId)) {
        throw new ForbiddenException('Bạn không có quyền truy cập sổ điểm của lớp học này');
      }
    }

    // Get active students of classroom
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        classroomId,
        status: { in: ['ACTIVE', 'COMPLETED', 'TRANSFERRED'] },
        student: { deletedAt: null },
      },
      include: {
        student: true,
      },
      orderBy: { student: { fullName: 'asc' } },
    });

    const students = enrollments.map((e) => e.student);

    // Get assessment columns
    const assessmentWhere: any = {
      classroomId,
      deletedAt: null,
      semester,
    };
    if (teacherId) assessmentWhere.teacherId = teacherId;
    if (subjectId && subjectId !== 'ALL') {
      assessmentWhere.subjectId = subjectId;
    }
    if (schoolYearId && schoolYearId !== 'ALL') {
      assessmentWhere.schoolYearId = schoolYearId;
    }

    const assessments = await this.prisma.assessment.findMany({
      where: assessmentWhere,
      include: {
        subject: true,
        criteria: true,
        studentAssessments: {
          include: { student: true },
        },
      },
      orderBy: [{ assessmentDate: 'asc' }, { createdAt: 'asc' }],
    });

    const columns = assessments.map((a) => {
      let metaObj: any = {};
      try {
        metaObj = a.meta ? JSON.parse(a.meta) : {};
      } catch {
        metaObj = { type: 'THUONG_XUYEN', weight: 1 };
      }

      const type = metaObj.type || 'THUONG_XUYEN';
      const weight = metaObj.weight || this.academicCalc.getWeight(type);

      return {
        id: a.id,
        title: a.title,
        subtitle: a.subtitle,
        subjectId: a.subjectId,
        subjectName: a.subject?.name || 'Môn học',
        semester: a.semester,
        type,
        weight,
        date: a.assessmentDate.toISOString().split('T')[0],
        status: a.status,
        version: a.version,
      };
    });

    // Build matrix for each student
    const studentRows = students.map((s) => {
      const scoresMap: Record<string, { id?: string; score: number | null; level?: string; comment?: string }> = {};
      const studentAssessmentItems: Array<{ id: string; score: number | null; type?: string; weight?: number }> = [];

      columns.forEach((col) => {
        const assessment = assessments.find((a) => a.id === col.id);
        const sa = assessment?.studentAssessments?.find((item) => item.studentId === s.id);

        const score = sa && typeof sa.score === 'number' && !isNaN(sa.score) ? sa.score : null;
        scoresMap[col.id] = {
          id: sa?.id,
          score,
          level: sa?.level || undefined,
          comment: sa?.comment || undefined,
        };

        studentAssessmentItems.push({
          id: col.id,
          score,
          type: col.type,
          weight: col.weight,
        });
      });

      const calcResult = this.academicCalc.calculateSubjectResult(studentAssessmentItems);

      return {
        studentId: s.id,
        studentCode: s.studentCode || undefined,
        fullName: s.fullName,
        initials: s.initials || s.fullName.slice(0, 2).toUpperCase(),
        gender: s.gender === 'FEMALE' ? 'Nữ' : 'Nam',
        scores: scoresMap,
        averageScore: calcResult.averageScore,
        minScore: calcResult.minScore,
        maxScore: calcResult.maxScore,
        totalAssessments: calcResult.totalAssessments,
        gradedAssessments: calcResult.gradedAssessments,
        isComplete: calcResult.isComplete,
        classification: calcResult.classification,
      };
    });

    // Summary statistics for gradebook
    const totalStudentsCount = studentRows.length;
    const gradedRows = studentRows.filter((r) => r.gradedAssessments > 0 && r.averageScore !== null);
    const gradedStudentsCount = gradedRows.length;

    let classAverage: number | null = null;
    if (gradedRows.length > 0) {
      const sumAvg = gradedRows.reduce((acc, curr) => acc + (curr.averageScore || 0), 0);
      classAverage = this.academicCalc.round(sumAvg / gradedRows.length, 1);
    }

    const excellentCount = studentRows.filter((r) => r.classification?.code === 'EXCELLENT').length;
    const goodCount = studentRows.filter((r) => r.classification?.code === 'GOOD').length;
    const completedCount = studentRows.filter((r) => r.classification?.code === 'COMPLETED').length;
    const needsSupportCount = studentRows.filter((r) => r.classification?.code === 'NEEDS_SUPPORT').length;
    const incompleteCount = studentRows.filter((r) => !r.classification).length;

    return {
      classroomId,
      classroomName: classroom.name,
      gradeName: classroom.grade?.name,
      schoolYearName: classroom.schoolYear?.name,
      subjectId: subjectId || null,
      semester,
      schoolYearId: schoolYearId || classroom.schoolYearId,
      columns,
      students: studentRows,
      summary: {
        totalStudents: totalStudentsCount,
        gradedStudents: gradedStudentsCount,
        classAverage,
        excellentCount,
        goodCount,
        completedCount,
        needsSupportCount,
        incompleteCount,
      },
    };
  }

  /**
   * Batch Save Scores for an Assessment
   */
  async bulkUpdateStudents(id: string, dto: BulkStudentAssessmentDto | BatchSaveAssessmentScoresDto, teacherId: string) {
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

    if (assessment.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền thao tác với đánh giá này');
    }

    const items: StudentAssessmentItemDto[] = (dto as any).scores || (dto as any).assessments || [];

    // Duplicate detection in payload
    const seenStudentIds = new Set<string>();
    for (const item of items) {
      if (seenStudentIds.has(item.studentId)) {
        throw new ConflictException(`Học sinh mã ${item.studentId} xuất hiện trùng lặp trong dữ liệu gửi lên`);
      }
      seenStudentIds.add(item.studentId);
    }

    // Validate score bounds (0 <= score <= 10 or null)
    for (const item of items) {
      if (item.score !== undefined && item.score !== null) {
        if (typeof item.score !== 'number' || isNaN(item.score) || item.score < 0 || item.score > 10) {
          throw new BadRequestException('Điểm số phải là giá trị số hợp lệ nằm trong thang điểm từ 0 đến 10');
        }
      }
    }

    // Validate student enrollment membership in classroom
    if (items.length > 0) {
      await this.assignmentAuth.assertStudentsEnrolled(
        assessment.classroomId,
        items.map((a) => a.studentId),
      );
    }

    // Validate nested criterion ID ownership
    const validCriterionIds = new Set(assessment.criteria.map((c) => c.id));
    for (const item of items) {
      if (item.criterionId && !validCriterionIds.has(item.criterionId)) {
        throw new BadRequestException('Tiêu chí đánh giá không thuộc bài đánh giá này');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        // Derive level from score if not explicitly set
        let level: AssessmentLevelEnum = item.level || AssessmentLevelEnum.COMPLETED;
        if (item.score !== null && item.score !== undefined) {
          if (item.score >= 8.0) {
            level = AssessmentLevelEnum.EXCELLENT;
          } else if (item.score >= 5.0) {
            level = AssessmentLevelEnum.COMPLETED;
          } else {
            level = AssessmentLevelEnum.NEEDS_SUPPORT;
          }
        }

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
              level: level as any,
              score: item.score !== undefined ? item.score : existing.score,
              comment: item.comment !== undefined ? item.comment : existing.comment,
            },
          });
        } else {
          await tx.studentAssessment.create({
            data: {
              assessmentId: id,
              studentId: item.studentId,
              assessmentCriterionId: item.criterionId || null,
              level: level as any,
              score: item.score,
              comment: item.comment,
            },
          });
        }
      }

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'GRADE_UPDATE',
        resourceType: 'Assessment',
        resourceId: id,
        details: { assessmentId: id, updatedCount: items.length },
      });

      return { success: true, message: `Đã cập nhật điểm cho ${items.length} học sinh thành công` };
    });
  }

  /**
   * Import Scores for an Assessment
   */
  async importGradebookScores(dto: ImportGradebookScoresDto, teacherId: string) {
    const { assessmentId, classroomId, scores } = dto;

    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { teachingAssignment: true },
    });
    if (!assessment || assessment.deletedAt) {
      throw new NotFoundException('Không tìm thấy bài đánh giá');
    }

    if (assessment.classroomId !== classroomId) {
      throw new BadRequestException('Bài đánh giá không thuộc lớp học được chọn');
    }

    if (assessment.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền thao tác với đánh giá này');
    }

    // Fetch enrolled students of this class
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { classroomId, student: { deletedAt: null } },
      include: { student: true },
    });

    const students = enrollments.map((e) => e.student);
    const studentByCode = new Map<string, any>();
    const studentById = new Map<string, any>();

    students.forEach((s) => {
      if (s.studentCode) studentByCode.set(s.studentCode.trim().toLowerCase(), s);
      studentById.set(s.id, s);
    });

    const errors: Array<{ row: number; studentCode?: string; fullName?: string; message: string }> = [];
    const validItems: Array<{ studentId: string; score: number | null; comment?: string }> = [];
    const seenStudentIds = new Set<string>();

    for (let i = 0; i < scores.length; i++) {
      const row = scores[i];
      const rowNumber = i + 1;

      let matchedStudent: any = null;
      if (row.studentId && studentById.has(row.studentId)) {
        matchedStudent = studentById.get(row.studentId);
      } else if (row.studentCode && studentByCode.has(row.studentCode.trim().toLowerCase())) {
        matchedStudent = studentByCode.get(row.studentCode.trim().toLowerCase());
      } else if (row.fullName) {
        matchedStudent = students.find(
          (s) => s.fullName.trim().toLowerCase() === row.fullName!.trim().toLowerCase(),
        );
      }

      if (!matchedStudent) {
        errors.push({
          row: rowNumber,
          studentCode: row.studentCode,
          fullName: row.fullName,
          message: `Không tìm thấy học sinh ${row.studentCode || row.fullName || ''} trong lớp ${classroomId}`,
        });
        continue;
      }

      if (seenStudentIds.has(matchedStudent.id)) {
        errors.push({
          row: rowNumber,
          studentCode: row.studentCode,
          fullName: matchedStudent.fullName,
          message: `Học sinh "${matchedStudent.fullName}" bị lặp lại nhiều lần trong file`,
        });
        continue;
      }
      seenStudentIds.add(matchedStudent.id);

      if (row.score !== null && row.score !== undefined) {
        if (typeof row.score !== 'number' || isNaN(row.score) || row.score < 0 || row.score > 10) {
          errors.push({
            row: rowNumber,
            studentCode: row.studentCode,
            fullName: matchedStudent.fullName,
            message: `Điểm số "${row.score}" không hợp lệ (phải từ 0 đến 10)`,
          });
          continue;
        }
      }

      validItems.push({
        studentId: matchedStudent.id,
        score: row.score !== undefined ? row.score : null,
        comment: row.comment,
      });
    }

    if (validItems.length === 0) {
      return {
        success: false,
        importedCount: 0,
        errorCount: errors.length,
        errors,
        message: 'Không có dữ liệu điểm hợp lệ để import',
      };
    }

    await this.bulkUpdateStudents(assessmentId, { assessments: validItems as any }, teacherId);

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'GRADE_IMPORT',
      resourceType: 'Assessment',
      resourceId: assessmentId,
      details: { importedCount: validItems.length, errorCount: errors.length },
    });

    return {
      success: true,
      importedCount: validItems.length,
      errorCount: errors.length,
      errors,
      message: `Đã import thành công điểm cho ${validItems.length} học sinh`,
    };
  }

  /**
   * Export Gradebook Data for Spreadsheet
   */
  async exportGradebook(query: GradebookQueryDto, teacherId?: string) {
    const gradebook = await this.getGradebook(query, teacherId);

    const headers = [
      'STT',
      'Mã học sinh',
      'Họ và tên',
      'Giới tính',
      ...gradebook.columns.map((c) => `${c.title} (${c.type === 'CUOI_KY' ? 'Hệ số 3' : c.type === 'GIUA_KY' ? 'Hệ số 2' : 'Hệ số 1'})`),
      'Điểm TB môn',
      'Xếp loại học lực',
    ];

    const rows = gradebook.students.map((s, index) => {
      const colScores = gradebook.columns.map((c) => {
        const item = s.scores[c.id];
        return item && item.score !== null && item.score !== undefined ? item.score : '—';
      });

      return [
        index + 1,
        s.studentCode || '—',
        s.fullName,
        s.gender,
        ...colScores,
        s.averageScore !== null ? s.averageScore : '—',
        s.classification ? s.classification.label : 'Chưa đủ dữ liệu',
      ];
    });

    return {
      classroomName: gradebook.classroomName,
      subjectName: gradebook.columns[0]?.subjectName || 'Tất cả môn',
      semester: gradebook.semester,
      headers,
      rows,
      summary: gradebook.summary,
    };
  }

  /**
   * Student Comprehensive Academic Profile
   */
  async getStudentAcademicProfile(studentId: string, teacherId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        classStudents: { where: { status: 'ACTIVE' }, include: { classroom: true } },
        studentEnrollments: {
          include: { schoolYear: true, classroom: { include: { grade: true } } },
          orderBy: { enrolledAt: 'desc' },
        },
        studentAssessments: {
          include: {
            assessment: {
              include: { subject: true, classroom: true, schoolYear: true },
            },
            criterion: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!student || student.deletedAt) {
      throw new NotFoundException('Không tìm thấy học sinh');
    }

    if (teacherId) {
      const accessibleClassIds = await this.getTeacherAccessibleClassroomIds(teacherId);
      const studentClassIds = [
        ...(student.classStudents || []).map((cs: any) => cs.classroomId),
        ...(student.studentEnrollments || []).map((se: any) => se.classroomId),
      ];
      const hasAccess = studentClassIds.some((cid) => accessibleClassIds.includes(cid));
      if (!hasAccess && studentClassIds.length > 0) {
        throw new ForbiddenException('Bạn không có quyền xem hồ sơ đánh giá của học sinh này');
      }
    }

    // Group assessments by SchoolYear -> Semester -> Subject
    const assessments = student.studentAssessments || [];
    const subjectsMap = new Map<string, { id: string; name: string; assessments: any[] }>();

    assessments.forEach((sa) => {
      const a = sa.assessment;
      if (!a || a.deletedAt) return;

      const subId = a.subjectId || 'GENERAL';
      const subName = a.subject?.name || 'Môn học chung';

      if (!subjectsMap.has(subId)) {
        subjectsMap.set(subId, { id: subId, name: subName, assessments: [] });
      }

      let metaObj: any = {};
      try {
        metaObj = a.meta ? JSON.parse(a.meta) : {};
      } catch {
        metaObj = { type: 'THUONG_XUYEN', weight: 1 };
      }

      subjectsMap.get(subId)!.assessments.push({
        id: a.id,
        title: a.title,
        date: a.assessmentDate.toISOString().split('T')[0],
        semester: a.semester || 1,
        type: metaObj.type || 'THUONG_XUYEN',
        weight: metaObj.weight || 1,
        score: typeof sa.score === 'number' && !isNaN(sa.score) ? sa.score : null,
        level: sa.level,
        comment: sa.comment,
        criterion: sa.criterion?.name,
      });
    });

    const subjectResults = Array.from(subjectsMap.values()).map((sub) => {
      const calc = this.academicCalc.calculateSubjectResult(sub.assessments);
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        averageScore: calc.averageScore,
        classification: calc.classification,
        assessments: sub.assessments,
      };
    });

    const semesterCalc = this.academicCalc.calculateSemesterResult(
      subjectResults.map((s) => ({ subjectId: s.subjectId, averageScore: s.averageScore })),
    );

    return {
      studentId: student.id,
      fullName: student.fullName,
      studentCode: student.studentCode,
      overallAverageScore: semesterCalc.averageScore,
      overallClassification: semesterCalc.classification,
      isComplete: semesterCalc.isComplete,
      subjects: subjectResults,
    };
  }

  private mapAssessment(a: any) {
    let metaObj: any = {};
    try {
      metaObj = a.meta ? JSON.parse(a.meta) : {};
    } catch {
      metaObj = { type: 'THUONG_XUYEN', weight: 1, meta: a.meta };
    }

    return {
      id: a.id,
      title: a.title,
      subtitle: a.subtitle || `${a.subject?.name || 'Toán'} · ${a.classroom?.name || 'Lớp 4A'}`,
      status: a.status || 'IN_PROGRESS',
      meta: metaObj.meta || `${a.studentAssessments?.length || 0} học sinh`,
      tone: a.tone || 'teal',
      semester: a.semester || 1,
      assessmentType: metaObj.type || 'THUONG_XUYEN',
      weight: metaObj.weight || 1,
      assessmentDate: a.assessmentDate ? a.assessmentDate.toISOString().split('T')[0] : null,
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
