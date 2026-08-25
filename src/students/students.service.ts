import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { TransferStudentDto } from './dto/transfer-student.dto';
import { ImportStudentsDto, ImportStudentRowDto } from './dto/import-students.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AuditService } from '../common/audit/audit.service';
import * as XLSX from 'xlsx';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';

export interface StudentFilterQuery extends PaginationQueryDto {
  classId?: string;
  classroomId?: string;
  gradeId?: string;
  schoolYearId?: string;
  status?: string;
  supportStatus?: string;
  sort?: string;
  search?: string;
  keyword?: string;
  q?: string;
}

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private classroomAccess: TeachingAssignmentAuthorizationService,
    @Optional() private auditService?: AuditService,
  ) {}

  async findAll(query: StudentFilterQuery, teacherId?: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Math.min(10000, Number(query.pageSize) || 20));
    const keyword = query.search || query.keyword || query.q;
    const classId = query.classroomId || query.classId;
    const gradeId = query.gradeId;
    const schoolYearId = query.schoolYearId;
    const status = query.status;
    const supportStatus = query.supportStatus;
    const sort = query.sort || 'nameAsc';
    const skip = (page - 1) * pageSize;

    // Anti-IDOR Scope: Teacher must have access to student's classroom
    let teacherClassIds: string[] = [];
    if (teacherId) {
      teacherClassIds = await this.classroomAccess.getAccessibleClassroomIds(teacherId);
      if (teacherClassIds.length === 0) {
        return {
          items: [],
          totalItems: 0,
          page,
          pageSize,
          totalPages: 0,
          summary: {
            totalStudents: 0,
            activeStudents: 0,
            needsSupportStudents: 0,
            avgAttendanceRate: null,
          },
        };
      }
    }

    // Determine target classroom IDs
    let targetClassIds: string[] = teacherClassIds;
    if (classId && classId !== 'ALL' && classId !== 'Tất cả') {
      if (teacherId && teacherClassIds.length > 0) {
        targetClassIds = teacherClassIds.includes(classId) ? [classId] : [];
      } else {
        targetClassIds = [classId];
      }

      if (targetClassIds.length === 0 && teacherId) {
        return {
          items: [],
          totalItems: 0,
          page,
          pageSize,
          totalPages: 0,
          summary: {
            totalStudents: 0,
            activeStudents: 0,
            needsSupportStudents: 0,
            avgAttendanceRate: null,
          },
        };
      }
    }

    // Active enrollment condition on primary StudentEnrollment relation
    const enrollmentCondition: any = {
      status: 'ACTIVE',
      classroom: {
        deletedAt: null,
      },
    };

    if (targetClassIds.length > 0) {
      enrollmentCondition.classroomId = { in: targetClassIds };
    }

    if (gradeId && gradeId !== 'ALL' && gradeId !== 'Tất cả') {
      enrollmentCondition.classroom.gradeId = gradeId;
    }

    if (schoolYearId && schoolYearId !== 'ALL' && schoolYearId !== 'Tất cả') {
      enrollmentCondition.classroom.schoolYearId = schoolYearId;
    }

    const classStudentCondition: any = {
      status: 'ACTIVE',
      classroom: {
        deletedAt: null,
      },
    };
    if (targetClassIds.length > 0) {
      classStudentCondition.classroomId = { in: targetClassIds };
    }
    if (gradeId && gradeId !== 'ALL' && gradeId !== 'Tất cả') {
      classStudentCondition.classroom.gradeId = gradeId;
    }
    if (schoolYearId && schoolYearId !== 'ALL' && schoolYearId !== 'Tất cả') {
      classStudentCondition.classroom.schoolYearId = schoolYearId;
    }

    const andConditions: any[] = [
      { deletedAt: null },
      {
        OR: [
          { studentEnrollments: { some: enrollmentCondition } },
          { classStudents: { some: classStudentCondition } },
        ],
      },
    ];

    // Status filter
    if (status && status !== 'ALL' && status !== 'Tất cả') {
      const statusMap: Record<string, string> = {
        Tốt: 'EXCELLENT',
        Khá: 'GOOD',
        'Cần cố gắng': 'NEEDS_SUPPORT',
        EXCELLENT: 'EXCELLENT',
        GOOD: 'GOOD',
        NEEDS_SUPPORT: 'NEEDS_SUPPORT',
      };
      const dbStatus = statusMap[status] || status;
      andConditions.push({ status: dbStatus });
    }

    // Support Status filter
    if (supportStatus && supportStatus !== 'ALL' && supportStatus !== 'Tất cả') {
      if (supportStatus === 'NEED_SUPPORT' || supportStatus === 'Cần hỗ trợ') {
        andConditions.push({ status: 'NEEDS_SUPPORT' });
      } else if (supportStatus === 'NORMAL' || supportStatus === 'Bình thường') {
        andConditions.push({ status: { not: 'NEEDS_SUPPORT' } });
      }
    }

    // Search keyword
    if (keyword && keyword.trim()) {
      const kw = keyword.trim();
      andConditions.push({
        OR: [
          { fullName: { contains: kw, mode: 'insensitive' } },
          { studentCode: { contains: kw, mode: 'insensitive' } },
          { parentName: { contains: kw, mode: 'insensitive' } },
          { parentPhone: { contains: kw, mode: 'insensitive' } },
        ],
      });
    }

    const where = { AND: andConditions };

    // Sorting
    let orderBy: any = { fullName: 'asc' };
    if (sort === 'nameDesc') {
      orderBy = { fullName: 'desc' };
    } else if (sort === 'nameAsc') {
      orderBy = { fullName: 'asc' };
    } else if (sort === 'codeAsc') {
      orderBy = { studentCode: 'asc' };
    } else if (sort === 'codeDesc') {
      orderBy = { studentCode: 'desc' };
    } else if (sort === 'updatedAt') {
      orderBy = { updatedAt: 'desc' };
    }

    const [totalItems, students, allScopeStudents] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          studentEnrollments: {
            where: {
              status: 'ACTIVE',
              classroom: { deletedAt: null },
              ...(targetClassIds.length > 0 ? { classroomId: { in: targetClassIds } } : {}),
            },
            include: { classroom: { include: { grade: true, schoolYear: true } } },
            orderBy: { enrolledAt: 'desc' },
          },
          classStudents: {
            where: {
              status: 'ACTIVE',
              classroom: { deletedAt: null },
              ...(targetClassIds.length > 0 ? { classroomId: { in: targetClassIds } } : {}),
            },
            include: { classroom: { include: { grade: true, schoolYear: true } } },
          },
          comments: {
            orderBy: { commentDate: 'desc' },
            take: 1,
          },
          studentAttendances: {
            where: {
              ...(targetClassIds.length > 0 ? { attendanceSession: { classroomId: { in: targetClassIds } } } : {}),
            },
            select: { status: true },
          },
          studentAssessments: {
            where: {
              assessment: {
                deletedAt: null,
                ...(targetClassIds.length > 0 ? { classroomId: { in: targetClassIds } } : {}),
              },
            },
            include: {
              assessment: {
                select: {
                  id: true,
                  title: true,
                  assessmentDate: true,
                  subject: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy,
      }),
      // Aggregate summary across current scope
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          status: true,
          studentAttendances: {
            where: {
              ...(targetClassIds.length > 0 ? { attendanceSession: { classroomId: { in: targetClassIds } } } : {}),
            },
            select: { status: true },
          },
        },
      }),
    ]);

    // Calculate Summary Stats
    const totalStudents = allScopeStudents.length;
    const activeStudents = totalStudents;
    const needsSupportStudents = allScopeStudents.filter((s) => s.status === 'NEEDS_SUPPORT').length;

    let totalRecordedAttendances = 0;
    let presentAttendances = 0;

    allScopeStudents.forEach((s) => {
      (s.studentAttendances || []).forEach((att: any) => {
        totalRecordedAttendances++;
        if (att.status === 'PRESENT' || att.status === 'LATE') {
          presentAttendances++;
        }
      });
    });

    const avgAttendanceRate: number | null =
      totalRecordedAttendances > 0
        ? Math.round((presentAttendances / totalRecordedAttendances) * 100)
        : null;

    let mappedItems = students.map((s) => this.mapStudentRecord(s));

    // In-memory sort for attendance if requested
    if (sort === 'attendanceLow' || sort === 'attendanceAsc') {
      mappedItems.sort((a, b) => {
        const attA = a.attendance ?? 100;
        const attB = b.attendance ?? 100;
        return attA - attB;
      });
    } else if (sort === 'attendanceHigh' || sort === 'attendanceDesc') {
      mappedItems.sort((a, b) => {
        const attA = a.attendance ?? 0;
        const attB = b.attendance ?? 0;
        return attB - attA;
      });
    }

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items: mappedItems,
      totalItems,
      page,
      pageSize,
      totalPages,
      summary: {
        totalStudents,
        activeStudents,
        needsSupportStudents,
        avgAttendanceRate,
      },
    };
  }

  async findOne(id: string, teacherId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        classStudents: {
          where: { status: 'ACTIVE' },
          include: { classroom: { include: { grade: true, schoolYear: true } } },
        },
        comments: {
          include: { teacher: true },
          orderBy: { commentDate: 'desc' },
        },
        studentAttendances: {
          include: { attendanceSession: { include: { schedule: { include: { subject: true } } } } },
          orderBy: { createdAt: 'desc' },
        },
        studentAssessments: {
          include: { assessment: { include: { subject: true } }, criterion: true },
        },
        studentEnrollments: {
          include: { schoolYear: true, classroom: { include: { grade: true } } },
          orderBy: { enrolledAt: 'desc' },
        },
      },
    });

    if (!student || student.deletedAt) {
      throw new NotFoundException(`Không tìm thấy học sinh với mã ${id}`);
    }

    // Anti-IDOR: a teacher may only see active enrollments in classrooms
    // returned by the current authorization scope. Related records are filtered
    // in memory as a final defense because legacy data may contain ClassStudent
    // rows outside the canonical enrollment table.
    if (teacherId) {
      const accessibleClassIds = await this.classroomAccess.getAccessibleClassroomIds(teacherId);
      const hasAccess =
        (student.studentEnrollments || []).some(
          (enrollment: any) =>
            enrollment.status === 'ACTIVE' && accessibleClassIds.includes(enrollment.classroomId),
        ) ||
        (student.classStudents || []).some(
          (cs: any) => cs.status === 'ACTIVE' && accessibleClassIds.includes(cs.classroomId),
        );

      if (!hasAccess) {
        throw new ForbiddenException('Bạn không có quyền truy cập thông tin học sinh này');
      }

      student.classStudents = (student.classStudents || []).filter((item: any) =>
        accessibleClassIds.includes(item.classroomId),
      );
      student.studentEnrollments = (student.studentEnrollments || []).filter((item: any) =>
        accessibleClassIds.includes(item.classroomId),
      );
      student.comments = (student.comments || []).filter(
        (item: any) => item.teacherId === teacherId && accessibleClassIds.includes(item.classroomId),
      );
      student.studentAttendances = (student.studentAttendances || []).filter(
        (item: any) =>
          item.attendanceSession?.teacherId === teacherId &&
          accessibleClassIds.includes(item.attendanceSession?.classroomId),
      );
      student.studentAssessments = (student.studentAssessments || []).filter(
        (item: any) => item.assessment?.teacherId === teacherId,
      );
    }

    return this.mapStudentRecord(student);
  }

  async create(dto: CreateStudentDto, teacherId: string) {
    let classId = dto.classroomId || dto.classId;
    if (!classId && teacherId) {
      const teacherClass = await this.prisma.classroom.findFirst({
        where: { teacherId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (teacherClass) {
        classId = teacherClass.id;
      }
    }

    if (!classId) {
      throw new ForbiddenException('Vui lòng chọn lớp học để ghi danh học sinh');
    }

    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException('Không tìm thấy lớp học');
    }

    // Verify teacher permission
    if (teacherId && classroom.teacherId !== teacherId) {
      const accessibleClassIds = await this.classroomAccess.getAccessibleClassroomIds(teacherId);
      if (!accessibleClassIds.includes(classId)) {
        throw new ForbiddenException('Bạn không có quyền thêm học sinh vào lớp học này');
      }
    }

    // Duplicate detection: studentCode uniqueness
    if (dto.studentCode && dto.studentCode.trim()) {
      const existingCode = await this.prisma.student.findUnique({
        where: { studentCode: dto.studentCode.trim() },
      });
      if (existingCode && !existingCode.deletedAt) {
        throw new ConflictException(`Mã học sinh "${dto.studentCode.trim()}" đã tồn tại trên hệ thống`);
      }
    }

    // Duplicate detection: same fullName active in this classroom
    const existingInClass = await this.prisma.classStudent.findFirst({
      where: {
        classroomId: classId,
        status: 'ACTIVE',
        student: {
          fullName: dto.fullName.trim(),
          deletedAt: null,
        },
      },
    });

    if (existingInClass) {
      throw new ConflictException(`Học sinh "${dto.fullName.trim()}" đã có tên trong danh sách lớp`);
    }

    const initials =
      dto.initials ||
      dto.fullName
        .trim()
        .split(' ')
        .map((p) => p[0])
        .slice(-2)
        .join('')
        .toUpperCase();

    // Auto-generate code if empty
    let studentCode = dto.studentCode?.trim();
    if (!studentCode) {
      const count = await this.prisma.student.count();
      studentCode = `HS${String(count + 1).padStart(4, '0')}`;
    }

    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          fullName: dto.fullName.trim(),
          studentCode,
          initials,
          gender: dto.gender === 'Nữ' || dto.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
          dobString: dto.dob || 'Chưa cập nhật',
          parentName: dto.parentName || 'Chưa cập nhật',
          parentPhone: dto.parentPhone || 'Chưa cập nhật',
          avatarColor: dto.color || 'bg-teal-100 text-teal-700',
          status: dto.status === 'Tốt' ? 'EXCELLENT' : dto.status === 'Cần cố gắng' ? 'NEEDS_SUPPORT' : 'GOOD',
        },
      });

      await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          schoolYearId: classroom.schoolYearId,
          classroomId: classId,
          status: 'ACTIVE',
          enrolledAt: new Date(),
          note: dto.note,
        },
      });

      await tx.classStudent.create({
        data: {
          classroomId: classId,
          studentId: student.id,
          status: 'ACTIVE',
        },
      });

      if (dto.note && dto.note.trim()) {
        await tx.studentComment.create({
          data: {
            studentId: student.id,
            teacherId,
            classroomId: classId,
            content: dto.note.trim(),
          },
        });
      }

      const created = await tx.student.findUnique({
        where: { id: student.id },
        include: {
          classStudents: {
            where: { status: 'ACTIVE' },
            include: { classroom: { include: { grade: true, schoolYear: true } } },
          },
          comments: {
            orderBy: { commentDate: 'desc' },
          },
          studentAttendances: true,
          studentAssessments: true,
        },
      });

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'STUDENT_CREATE',
        resourceType: 'Student',
        resourceId: student.id,
        details: { fullName: student.fullName, studentCode, classroomId: classId },
      });

      return this.mapStudentRecord(created);
    });
  }

  async update(id: string, dto: UpdateStudentDto, teacherId: string) {
    await this.findOne(id, teacherId);

    const data: any = {};
    if (dto.fullName) data.fullName = dto.fullName.trim();
    if (dto.studentCode) {
      const code = dto.studentCode.trim();
      const existing = await this.prisma.student.findUnique({ where: { studentCode: code } });
      if (existing && existing.id !== id && !existing.deletedAt) {
        throw new ConflictException(`Mã học sinh "${code}" đã được sử dụng`);
      }
      data.studentCode = code;
    }
    if (dto.initials) data.initials = dto.initials;
    if (dto.gender) data.gender = dto.gender === 'Nữ' || dto.gender === 'FEMALE' ? 'FEMALE' : 'MALE';
    if (dto.dob) data.dobString = dto.dob;
    if (dto.parentName) data.parentName = dto.parentName;
    if (dto.parentPhone) data.parentPhone = dto.parentPhone;
    if (dto.color) data.avatarColor = dto.color;
    if (dto.status) {
      data.status =
        dto.status === 'Tốt' || dto.status === 'EXCELLENT'
          ? 'EXCELLENT'
          : dto.status === 'Cần cố gắng' || dto.status === 'NEEDS_SUPPORT'
          ? 'NEEDS_SUPPORT'
          : 'GOOD';
    }

    await this.prisma.student.update({
      where: { id },
      data,
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'STUDENT_UPDATE',
      resourceType: 'Student',
      resourceId: id,
      details: { updatedFields: Object.keys(data) },
    });

    return this.findOne(id, teacherId);
  }

  async remove(id: string, teacherId: string) {
    const student = await this.findOne(id, teacherId);

    return this.prisma.$transaction(async (tx) => {
      // Close active enrollments
      await tx.studentEnrollment.updateMany({
        where: { studentId: id, status: 'ACTIVE' },
        data: { status: 'WITHDRAWN', leftAt: new Date() },
      });

      await tx.classStudent.updateMany({
        where: { studentId: id, status: 'ACTIVE' },
        data: { status: 'INACTIVE', leftAt: new Date() },
      });

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'STUDENT_LEAVE',
        resourceType: 'Student',
        resourceId: id,
        details: { fullName: student.name },
      });

      return { success: true, message: 'Đã rút học sinh khỏi lớp' };
    });
  }

  async transferStudent(id: string, dto: TransferStudentDto, teacherId: string) {
    const student = await this.findOne(id, teacherId);

    const targetClassroom = await this.prisma.classroom.findUnique({
      where: { id: dto.targetClassroomId },
    });

    if (!targetClassroom || targetClassroom.deletedAt) {
      throw new NotFoundException('Lớp học đích không tồn tại hoặc đã bị xóa');
    }

    if (teacherId) {
      const accessibleClassIds = await this.classroomAccess.getAccessibleClassroomIds(teacherId);
      if (!accessibleClassIds.includes(dto.targetClassroomId)) {
        throw new ForbiddenException('Bạn không có quyền chuyển học sinh vào lớp học này');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Close old active enrollments
      await tx.studentEnrollment.updateMany({
        where: { studentId: id, status: 'ACTIVE' },
        data: {
          status: 'TRANSFERRED',
          leftAt: new Date(),
          transferReason: dto.reason || 'Chuyển lớp',
        },
      });

      // 2. Update old classStudent
      await tx.classStudent.updateMany({
        where: { studentId: id, status: 'ACTIVE' },
        data: { status: 'TRANSFERRED', leftAt: new Date() },
      });

      // 3. Create new enrollment
      await tx.studentEnrollment.create({
        data: {
          studentId: id,
          schoolYearId: targetClassroom.schoolYearId,
          classroomId: dto.targetClassroomId,
          status: 'ACTIVE',
          enrolledAt: new Date(),
          note: dto.reason,
        },
      });

      // 4. Upsert classStudent for target classroom
      await tx.classStudent.upsert({
        where: {
          classroomId_studentId: {
            classroomId: dto.targetClassroomId,
            studentId: id,
          },
        },
        create: {
          classroomId: dto.targetClassroomId,
          studentId: id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        update: {
          status: 'ACTIVE',
          leftAt: null,
          joinedAt: new Date(),
        },
      });

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'STUDENT_TRANSFER',
        resourceType: 'Student',
        resourceId: id,
        details: {
          studentName: student.name,
          targetClassroomId: dto.targetClassroomId,
          targetClassName: targetClassroom.name,
          reason: dto.reason,
        },
      });

      return {
        success: true,
        message: `Đã chuyển học sinh ${student.name} sang lớp ${targetClassroom.name} thành công`,
      };
    });
  }

  async importStudents(dto: ImportStudentsDto, teacherId: string) {
    const { classroomId, students: rows } = dto;

    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
    });

    if (!classroom || classroom.deletedAt) {
      throw new NotFoundException('Lớp học không tồn tại');
    }

    if (teacherId) {
      const accessibleClassIds = await this.classroomAccess.getAccessibleClassroomIds(teacherId);
      if (!accessibleClassIds.includes(classroomId)) {
        throw new ForbiddenException('Bạn không có quyền import học sinh vào lớp học này');
      }
    }

    const errors: Array<{ row: number; fullName?: string; message: string }> = [];
    const validRows: ImportStudentRowDto[] = [];
    const seenCodesInBatch = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;

      if (!row.fullName || !row.fullName.trim()) {
        errors.push({ row: rowNumber, message: 'Thiếu họ và tên học sinh' });
        continue;
      }

      if (row.studentCode && row.studentCode.trim()) {
        const code = row.studentCode.trim();
        if (seenCodesInBatch.has(code)) {
          errors.push({ row: rowNumber, fullName: row.fullName, message: `Mã học sinh "${code}" bị trùng lặp trong file import` });
          continue;
        }
        seenCodesInBatch.add(code);

        const existingStudent = await this.prisma.student.findUnique({
          where: { studentCode: code },
        });
        if (existingStudent && !existingStudent.deletedAt) {
          errors.push({ row: rowNumber, fullName: row.fullName, message: `Mã học sinh "${code}" đã tồn tại trong hệ thống` });
          continue;
        }
      }

      validRows.push(row);
    }

    if (validRows.length === 0) {
      return {
        success: false,
        importedCount: 0,
        errorCount: errors.length,
        errors,
      };
    }

    let currentStudentCount = await this.prisma.student.count();

    await this.prisma.$transaction(async (tx) => {
      for (const r of validRows) {
        currentStudentCount++;
        const studentCode = r.studentCode?.trim() || `HS${String(currentStudentCount).padStart(4, '0')}`;
        const initials = r.fullName
          .trim()
          .split(' ')
          .map((p) => p[0])
          .slice(-2)
          .join('')
          .toUpperCase();

        const student = await tx.student.create({
          data: {
            fullName: r.fullName.trim(),
            studentCode,
            initials,
            gender: r.gender === 'Nữ' || r.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
            dobString: r.dob || 'Chưa cập nhật',
            parentName: r.parentName || 'Chưa cập nhật',
            parentPhone: r.parentPhone || 'Chưa cập nhật',
            status: 'GOOD',
          },
        });

        await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            schoolYearId: classroom.schoolYearId,
            classroomId,
            status: 'ACTIVE',
            enrolledAt: new Date(),
            note: r.note,
          },
        });

        await tx.classStudent.create({
          data: {
            classroomId,
            studentId: student.id,
            status: 'ACTIVE',
          },
        });

        if (r.note && r.note.trim()) {
          await tx.studentComment.create({
            data: {
              studentId: student.id,
              teacherId,
              classroomId,
              content: r.note.trim(),
            },
          });
        }
      }
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'STUDENT_IMPORT',
      resourceType: 'Classroom',
      resourceId: classroomId,
      details: { importedCount: validRows.length, errorCount: errors.length },
    });

    return {
      success: true,
      importedCount: validRows.length,
      errorCount: errors.length,
      errors,
      message: `Đã import thành công ${validRows.length} học sinh vào lớp ${classroom.name}`,
    };
  }
  async getProfile(id: string, teacherId: string) {
    const student = await this.findOne(id, teacherId);
    const classroomIds = await this.classroomAccess.getAccessibleClassroomIds(teacherId);
    const activeEnrollment = await this.prisma.studentEnrollment.findFirst({
      where: { studentId: id, status: 'ACTIVE', classroomId: { in: classroomIds } },
      include: { classroom: { include: { grade: true, schoolYear: true } }, schoolYear: true },
      orderBy: { enrolledAt: 'desc' },
    });

    const [
      attendanceRows, recentAttendance, assessmentRows, recentAssessments,
      commentsCount, recentComments, behaviorsCount, recentBehaviors, assignments,
    ] = await Promise.all([
      this.prisma.studentAttendance.findMany({
        where: { studentId: id, attendanceSession: { teacherId, classroomId: { in: classroomIds } } },
        select: { status: true },
      }),
      this.prisma.studentAttendance.findMany({
        where: { studentId: id, attendanceSession: { teacherId, classroomId: { in: classroomIds } } },
        include: { attendanceSession: { include: { schedule: { include: { subject: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.studentAssessment.findMany({
        where: { studentId: id, assessment: { teacherId, classroomId: { in: classroomIds }, deletedAt: null } },
        include: { assessment: { include: { subject: true, classroom: true } }, criterion: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentAssessment.findMany({
        where: { studentId: id, assessment: { teacherId, classroomId: { in: classroomIds }, deletedAt: null } },
        include: { assessment: { include: { subject: true, classroom: true } }, criterion: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.studentComment.count({ where: { studentId: id, teacherId, classroomId: { in: classroomIds } } }),
      this.prisma.studentComment.findMany({
        where: { studentId: id, teacherId, classroomId: { in: classroomIds } },
        include: { classroom: true, subject: true },
        orderBy: { commentDate: 'desc' },
        take: 5,
      }),
      this.prisma.studentBehaviorRecord.count({ where: { studentId: id, teacherId, classroomId: { in: classroomIds } } }),
      this.prisma.studentBehaviorRecord.findMany({
        where: { studentId: id, teacherId, classroomId: { in: classroomIds } },
        include: { classroom: true },
        orderBy: { recordDate: 'desc' },
        take: 5,
      }),
      this.prisma.worksheetAssignment.findMany({
        where: {
          teacherId,
          classroomId: { in: classroomIds },
          status: { not: 'CANCELLED' },
          classroom: { studentEnrollments: { some: { studentId: id, status: 'ACTIVE' } } },
        },
        include: {
          worksheet: { select: { id: true, title: true, status: true } },
          classroom: { select: { id: true, name: true, code: true } },
        },
        orderBy: { assignedAt: 'desc' },
      }),
    ]);

    const presentCount = attendanceRows.filter((row: any) => row.status === 'PRESENT' || row.status === 'LATE').length;
    const absentCount = attendanceRows.filter((row: any) => row.status === 'EXCUSED_ABSENCE' || row.status === 'UNEXCUSED_ABSENCE').length;
    const lateCount = attendanceRows.filter((row: any) => row.status === 'LATE').length;
    const scored = assessmentRows.filter((row: any) => typeof row.score === 'number');
    const avgScore = scored.length
      ? Number((scored.reduce((sum: number, row: any) => sum + row.score, 0) / scored.length).toFixed(1))
      : null;

    return {
      student,
      currentEnrollment: activeEnrollment ? {
        id: activeEnrollment.id,
        status: activeEnrollment.status,
        classroom: activeEnrollment.classroom,
        schoolYear: activeEnrollment.schoolYear,
      } : null,
      stats: {
        attendanceRate: attendanceRows.length ? Math.round((presentCount / attendanceRows.length) * 100) : null,
        totalSessions: attendanceRows.length,
        absences: absentCount,
        lates: lateCount,
        avgScore,
        assessmentsCount: assessmentRows.length,
        commentsCount,
        behaviorsCount,
        assignmentsCount: assignments.length,
      },
      recent: {
        attendance: recentAttendance,
        assessments: recentAssessments,
        comments: recentComments,
        behaviors: recentBehaviors,
        assignments,
      },
    };
  }

  async getOverview(id: string, teacherId: string) {
    const student = await this.findOne(id, teacherId);
    const accessibleClassIds = await this.classroomAccess.getAccessibleClassroomIds(teacherId);

    const attendances = await this.prisma.studentAttendance.findMany({
      where: { studentId: id, attendanceSession: { teacherId, classroomId: { in: accessibleClassIds } } },
    });

    const totalSessions = attendances.length;
    const present = attendances.filter((a: any) => a.status === 'PRESENT' || a.status === 'LATE').length;
    const absences = attendances.filter((a: any) => a.status === 'EXCUSED_ABSENCE' || a.status === 'UNEXCUSED_ABSENCE').length;
    const lates = attendances.filter((a: any) => a.status === 'LATE').length;
    const attendanceRate = totalSessions > 0 ? Math.round((present / totalSessions) * 100) : null;

    const assessments = await this.prisma.studentAssessment.findMany({
      where: { studentId: id, assessment: { teacherId } },
      include: { assessment: { include: { subject: true } } },
    });

    const validScores = assessments.filter((a: any) => typeof a.score === 'number' && a.score !== null);
    const avgScore =
      validScores.length > 0
        ? parseFloat((validScores.reduce((acc: number, a: any) => acc + (a.score || 0), 0) / validScores.length).toFixed(1))
        : null;

    const commentsCount = await this.prisma.studentComment.count({ where: { studentId: id, teacherId } });

    return {
      student,
      stats: {
        attendanceRate,
        totalSessions,
        absences,
        lates,
        avgScore,
        assessmentsCount: assessments.length,
        commentsCount,
      },
    };
  }

  async getAttendance(id: string, teacherId: string) {
    await this.findOne(id, teacherId);
    const accessibleClassIds = await this.classroomAccess.getAccessibleClassroomIds(teacherId);

    const attendances = await this.prisma.studentAttendance.findMany({
      where: { studentId: id, attendanceSession: { teacherId, classroomId: { in: accessibleClassIds } } },
      include: {
        attendanceSession: {
          include: {
            schedule: { include: { subject: true } },
            teacher: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const statusMap: Record<string, string> = {
      PRESENT: 'Có mặt',
      EXCUSED_ABSENCE: 'Nghỉ có phép',
      UNEXCUSED_ABSENCE: 'Nghỉ không phép',
      LATE: 'Đi muộn',
    };

    const totalSessions = attendances.length;
    const presentCount = attendances.filter((a: any) => a.status === 'PRESENT').length;
    const excusedCount = attendances.filter((a: any) => a.status === 'EXCUSED_ABSENCE').length;
    const unexcusedCount = attendances.filter((a: any) => a.status === 'UNEXCUSED_ABSENCE').length;
    const lateCount = attendances.filter((a: any) => a.status === 'LATE').length;
    const attendanceRate =
      totalSessions > 0 ? Math.round(((presentCount + lateCount) / totalSessions) * 100) : null;

    const sessions = attendances.map((a: any) => ({
      id: a.id,
      date: new Date(a.attendanceSession?.attendanceDate || a.createdAt).toLocaleDateString('vi-VN'),
      subjectName: a.attendanceSession?.schedule?.subject?.name || 'Môn học',
      teacherName: a.attendanceSession?.teacher?.fullName || 'Giáo viên',
      period: a.attendanceSession?.schedule?.startTime ? `${a.attendanceSession.schedule.startTime} - ${a.attendanceSession.schedule.endTime}` : 'Tiết học',
      status: a.status,
      statusLabel: statusMap[a.status] || 'Có mặt',
      lateMinutes: a.lateMinutes || 0,
      note: a.note || (a.status === 'LATE' ? `Muộn ${a.lateMinutes} phút` : ''),
    }));

    return {
      summary: {
        attendanceRate,
        totalSessions,
        presentCount,
        excusedCount,
        unexcusedCount,
        lateCount,
      },
      sessions,
    };
  }

  async getAssessments(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    const assessments = await this.prisma.studentAssessment.findMany({
      where: { studentId: id, assessment: { teacherId } },
      include: {
        assessment: { include: { subject: true, classroom: true } },
        criterion: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const validScores = assessments.filter((a: any) => typeof a.score === 'number' && a.score !== null);
    const avgScore =
      validScores.length > 0
        ? parseFloat((validScores.reduce((acc: number, a: any) => acc + (a.score || 0), 0) / validScores.length).toFixed(1))
        : null;

    const items = assessments.map((a: any) => ({
      id: a.id,
      name: a.assessment?.title || 'Bài đánh giá',
      subjectName: a.assessment?.subject?.name || 'Môn học',
      className: a.assessment?.classroom?.name || '',
      date: new Date(a.createdAt).toLocaleDateString('vi-VN'),
      score: a.score,
      level: a.level,
      criterion: a.criterion?.name,
      comment: a.comment,
    }));

    return {
      summary: {
        totalAssessments: assessments.length,
        avgScore,
      },
      items,
    };
  }

  async getComments(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    const comments = await this.prisma.studentComment.findMany({
      where: { studentId: id, teacherId },
      include: { teacher: true, classroom: true },
      orderBy: { commentDate: 'desc' },
    });

    return comments.map((c: any) => ({
      id: c.id,
      content: c.content,
      date: new Date(c.commentDate).toLocaleDateString('vi-VN'),
      teacherName: c.teacher?.fullName || 'Giáo viên',
      className: c.classroom?.name,
    }));
  }

  async addComment(id: string, content: string, classroomId: string | undefined, teacherId: string) {
    const student = await this.findOne(id, teacherId);

    const targetClassId = classroomId || student.classId;
    const accessibleClassIds = await this.classroomAccess.getAccessibleClassroomIds(teacherId);
    if (!targetClassId || !accessibleClassIds.includes(targetClassId)) {
      throw new ForbiddenException('Bạn không có quyền ghi nhận xét cho lớp học này');
    }
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { studentId: id, classroomId: targetClassId, status: 'ACTIVE' },
    });
    if (!enrollment) {
      throw new ForbiddenException('Học sinh không thuộc lớp học đang được chọn');
    }

    return this.prisma.studentComment.create({
      data: {
        studentId: id,
        teacherId,
        classroomId: targetClassId,
        content: content.trim(),
      },
    });
  }

  async getEnrollments(id: string, teacherId?: string) {
    await this.findOne(id, teacherId);
    const accessibleClassIds = teacherId ? await this.classroomAccess.getAccessibleClassroomIds(teacherId) : undefined;

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { studentId: id, ...(accessibleClassIds ? { classroomId: { in: accessibleClassIds } } : {}) },
      include: {
        schoolYear: true,
        classroom: { include: { grade: true } },
      },
      orderBy: [
        { schoolYear: { startDate: 'desc' } },
        { enrolledAt: 'desc' },
      ],
    });

    return enrollments.map((e: any) => ({
      id: e.id,
      schoolYearId: e.schoolYearId,
      schoolYear: e.schoolYear ? { id: e.schoolYear.id, name: e.schoolYear.name, isCurrent: e.schoolYear.isCurrent } : undefined,
      classroomId: e.classroomId,
      classroom: e.classroom ? { id: e.classroom.id, code: e.classroom.code, name: e.classroom.name, gradeName: e.classroom.grade?.name, room: e.classroom.room } : undefined,
      status: e.status,
      enrolledAt: e.enrolledAt,
      leftAt: e.leftAt,
      transferReason: e.transferReason,
      note: e.note,
    }));
  }

  async exportXlsx(query: StudentFilterQuery, teacherId?: string): Promise<{ buffer: Buffer; filename: string }> {
    const list = await this.findAll({ ...query, page: 1, pageSize: 10000 }, teacherId);

    const rows = list.items.map((student, idx) => ({
      'STT': idx + 1,
      'Mã học sinh': student.studentCode || `HS${String(idx + 1).padStart(4, '0')}`,
      'Họ và tên': student.fullName || student.name,
      'Giới tính': student.gender || 'Nam',
      'Ngày sinh': student.dob || 'Chưa cập nhật',
      'Lớp': student.className || 'Chưa phân lớp',
      'Khối': student.gradeName || '',
      'Năm học': student.schoolYearName || '',
      'Trạng thái': student.status || 'Khá',
      'Chuyên cần (%)': student.attendance !== null && student.attendance !== undefined ? `${student.attendance}%` : 'Chưa có',
      'Đánh giá gần nhất': (student as any).latestAssessment || (student as any).latestAssessmentText || 'Chưa có',
      'Cần hỗ trợ': (student as any).isNeedSupport || (student as any).needsSupport || student.status === 'Cần cố gắng' ? 'Có' : 'Không',
      'Phụ huynh': student.parentName || student.guardian || 'Chưa cập nhật',
      'Số điện thoại': student.parentPhone || student.phone || 'Chưa cập nhật',
      'Ghi chú': student.note || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(
      rows.length > 0 ? rows : [{ 'Thông báo': 'Không có dữ liệu học sinh phù hợp' }],
    );

    const colWidths = [
      { wch: 6 },
      { wch: 14 },
      { wch: 24 },
      { wch: 10 },
      { wch: 14 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 24 },
      { wch: 14 },
      { wch: 22 },
      { wch: 16 },
      { wch: 28 },
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách học sinh');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Danh_sach_hoc_sinh_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return { buffer, filename };
  }

  private mapStudentRecord(s: any) {
    const statusMap: Record<string, string> = {
      EXCELLENT: 'Tốt',
      GOOD: 'Khá',
      NEEDS_SUPPORT: 'Cần cố gắng',
    };
    const genderMap: Record<string, string> = {
      MALE: 'Nam',
      FEMALE: 'Nữ',
      OTHER: 'Khác',
    };

    const activeEnrollment = s.studentEnrollments?.[0] || s.classStudents?.[0];
    const activeClass = activeEnrollment?.classroom;
    const latestComment = s.comments?.[0]?.content || 'Chưa có nhận xét.';

    let studentAttendance: number | null = null;
    if (s.studentAttendances && s.studentAttendances.length > 0) {
      const pres = s.studentAttendances.filter((a: any) => a.status === 'PRESENT' || a.status === 'LATE').length;
      studentAttendance = Math.round((pres / s.studentAttendances.length) * 100);
    }

    const latestAssessment = s.studentAssessments?.[0];
    let latestAssessmentText = 'Chưa có';
    if (latestAssessment) {
      const scoreStr =
        typeof latestAssessment.score === 'number' && !isNaN(latestAssessment.score)
          ? `${latestAssessment.score} đ`
          : latestAssessment.level === 'EXCELLENT'
          ? 'Tốt'
          : latestAssessment.level === 'COMPLETED'
          ? 'Đạt'
          : 'Cần cố gắng';
      const subjName = latestAssessment.assessment?.subject?.name || latestAssessment.assessment?.title || '';
      latestAssessmentText = subjName ? `${scoreStr} (${subjName})` : scoreStr;
    }

    const isNeedSupport = s.status === 'NEEDS_SUPPORT' || (studentAttendance !== null && studentAttendance < 80);

    return {
      id: s.id,
      studentCode: s.studentCode || undefined,
      name: s.fullName,
      fullName: s.fullName,
      initials: s.initials || s.fullName.slice(0, 2).toUpperCase(),
      gender: genderMap[s.gender] || 'Nam',
      dob: s.dobString || (s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('vi-VN') : 'Chưa cập nhật'),
      guardian: s.parentName || 'Chưa cập nhật',
      parentName: s.parentName || 'Chưa cập nhật',
      phone: s.parentPhone || 'Chưa cập nhật',
      parentPhone: s.parentPhone || 'Chưa cập nhật',
      progress: s.status === 'EXCELLENT' ? 92 : s.status === 'GOOD' ? 84 : 70,
      status: statusMap[s.status] || 'Khá',
      attendance: studentAttendance,
      latestAssessment: latestAssessmentText,
      latestAssessmentText,
      needsSupport: isNeedSupport,
      isNeedSupport,
      note: latestComment,
      color: s.avatarColor || 'bg-teal-100 text-teal-700',
      className: activeClass?.name || 'Chưa phân lớp',
      classId: activeClass?.id || '',
      gradeName: activeClass?.grade?.name,
      schoolYearName: activeClass?.schoolYear?.name,
      enrollmentId: activeEnrollment?.id,
      enrolledAt: activeEnrollment?.enrolledAt || activeEnrollment?.joinedAt,
    };
  }
}
