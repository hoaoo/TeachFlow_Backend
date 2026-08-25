import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/create-comment.dto';
import { BatchCreateCommentsDto } from './dto/batch-create-comments.dto';

@Injectable()
export class StudentCommentsService {
  constructor(private prisma: PrismaService) {}

  async createForStudent(studentId: string, dto: CreateCommentDto, teacherId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        classStudents: {
          where: { status: 'ACTIVE', classroom: { deletedAt: null } },
          include: { classroom: true },
        },
      },
    });

    if (!student || student.deletedAt) {
      throw new NotFoundException('Không tìm thấy học sinh');
    }

    // Verify student belongs to at least one active classroom of the current teacher
    const matchingClassStudent = student.classStudents?.find(
      (cs) => cs.classroom?.teacherId === teacherId,
    );

    if (!matchingClassStudent) {
      throw new ForbiddenException('Bạn không có quyền nhận xét học sinh này');
    }

    let classroomId = dto.classroomId;
    if (classroomId) {
      const validClass = student.classStudents?.some(
        (cs) => cs.classroomId === classroomId && cs.classroom?.teacherId === teacherId,
      );
      if (!validClass) {
        throw new ForbiddenException('Lớp học không hợp lệ cho học sinh này');
      }
    } else {
      classroomId = matchingClassStudent.classroomId;
    }

    const comment = await this.prisma.studentComment.create({
      data: {
        studentId,
        teacherId,
        classroomId,
        subjectId: dto.subjectId,
        content: dto.content,
      },
      include: {
        teacher: true,
      },
    });

    return {
      id: comment.id,
      content: comment.content,
      date: new Date(comment.commentDate).toLocaleDateString('vi-VN'),
      teacherName: comment.teacher?.fullName || 'Giáo viên',
    };
  }

  async createBatch(dto: BatchCreateCommentsDto, teacherId: string) {
    if (!teacherId) throw new ForbiddenException('TEACHER_NOT_FOUND');
    const classroom = await this.prisma.classroom.findFirst({
      where: {
        id: dto.classroomId,
        isActive: true,
        deletedAt: null,
        OR: [
          { teacherId },
          { homeroomTeacherId: teacherId },
          { teachingAssignments: { some: { teacherId, isActive: true } } },
        ],
      },
      select: { id: true },
    });
    if (!classroom) throw new ForbiddenException('CLASSROOM_NOT_FOUND');

    const ids = [...new Set(dto.studentIds)];
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { classroomId: dto.classroomId, studentId: { in: ids }, status: 'ACTIVE', student: { deletedAt: null } },
      select: { studentId: true },
    });
    const validIds = new Set(enrollments.map((enrollment) => enrollment.studentId));
    if (validIds.size !== ids.length) throw new ForbiddenException('INVALID_STUDENT_ENROLLMENT');

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const studentId of ids) {
        rows.push(await tx.studentComment.create({
          data: {
            studentId,
            teacherId,
            classroomId: dto.classroomId,
            subjectId: dto.subjectId,
            content: dto.content.trim(),
            commentDate: dto.commentDate ? new Date(dto.commentDate) : undefined,
          },
        }));
      }
      return rows;
    });
    return { success: true, count: created.length, comments: created };
  }

  async update(id: string, dto: UpdateCommentDto, teacherId: string) {
    const comment = await this.prisma.studentComment.findUnique({
      where: { id },
    });

    if (!comment) {
      throw new NotFoundException('Không tìm thấy nhận xét');
    }

    if (comment.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền sửa nhận xét của giáo viên khác');
    }

    const updated = await this.prisma.studentComment.update({
      where: { id },
      data: { content: dto.content },
      include: { teacher: true },
    });

    return {
      id: updated.id,
      content: updated.content,
      date: new Date(updated.commentDate).toLocaleDateString('vi-VN'),
      teacherName: updated.teacher?.fullName || 'Giáo viên',
    };
  }

  async remove(id: string, teacherId: string) {
    const comment = await this.prisma.studentComment.findUnique({
      where: { id },
    });

    if (!comment) {
      throw new NotFoundException('Không tìm thấy nhận xét');
    }

    if (comment.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa nhận xét của giáo viên khác');
    }

    await this.prisma.studentComment.delete({
      where: { id },
    });

    return { success: true, message: 'Đã xóa nhận xét' };
  }
}
