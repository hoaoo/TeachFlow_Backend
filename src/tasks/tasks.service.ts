import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAll(teacherId?: string) {
    const where: any = {};
    if (teacherId) {
      where.teacherId = teacherId;
    }

    const tasks = await this.prisma.teacherTask.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      due: t.dueDate || 'Hôm nay',
      done: t.done,
    }));
  }

  async create(dto: CreateTaskDto, teacherId: string) {
    const task = await this.prisma.teacherTask.create({
      data: {
        teacherId,
        title: dto.title,
        dueDate: dto.due || 'Hôm nay',
        done: dto.done || false,
      },
    });

    return {
      id: task.id,
      title: task.title,
      due: task.dueDate,
      done: task.done,
    };
  }

  async update(id: string, dto: UpdateTaskDto, teacherId: string) {
    const existing = await this.prisma.teacherTask.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ');
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền sửa nhiệm vụ này');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.due !== undefined) data.dueDate = dto.due;
    if (dto.done !== undefined) {
      data.done = dto.done;
      data.status = dto.done ? 'COMPLETED' : 'PENDING';
    }

    const updated = await this.prisma.teacherTask.update({
      where: { id },
      data,
    });

    return {
      id: updated.id,
      title: updated.title,
      due: updated.dueDate,
      done: updated.done,
    };
  }

  async remove(id: string, teacherId: string) {
    const existing = await this.prisma.teacherTask.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ');
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa nhiệm vụ này');
    }

    await this.prisma.teacherTask.delete({ where: { id } });
    return { success: true, message: 'Đã xóa nhiệm vụ' };
  }
}
