import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto, UpdateCommentDto } from './dto/create-comment.dto';

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
