import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';
import { getTodayVNRange } from './tasks-cleanup.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAll(teacherId?: string) {
    const { todayStr, startOfDayUTC, endOfDayUTC } = getTodayVNRange();

    const where: any = {
      OR: [
        { taskDate: todayStr },
        {
          AND: [
            { taskDate: null },
            { createdAt: { gte: startOfDayUTC, lte: endOfDayUTC } },
          ],
        },
      ],
    };

    if (teacherId) {
      where.teacherId = teacherId;
    }

    const tasks = await this.prisma.teacherTask.findMany({
      where,
      orderBy: [{ done: 'asc' }, { createdAt: 'asc' }],
    });

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      due: t.dueDate || 'Hôm nay',
      done: t.done,
      taskDate: t.taskDate,
      priority: t.priority,
      completedAt: t.completedAt,
    }));
  }

  async create(dto: CreateTaskDto, teacherId: string) {
    const { todayStr } = getTodayVNRange();
    const isDone = Boolean(dto.done);

    const task = await this.prisma.teacherTask.create({
      data: {
        teacherId,
        title: dto.title.trim(),
        taskDate: todayStr,
        dueDate: dto.due?.trim() || 'Hôm nay',
        done: isDone,
        status: isDone ? 'COMPLETED' : 'PENDING',
        completedAt: isDone ? new Date() : null,
      },
    });

    return {
      id: task.id,
      title: task.title,
      due: task.dueDate,
      done: task.done,
      taskDate: task.taskDate,
      priority: task.priority,
      completedAt: task.completedAt,
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
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.due !== undefined) data.dueDate = dto.due.trim();
    if (dto.done !== undefined) {
      data.done = dto.done;
      data.status = dto.done ? 'COMPLETED' : 'PENDING';
      data.completedAt = dto.done ? new Date() : null;
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
      taskDate: updated.taskDate,
      priority: updated.priority,
      completedAt: updated.completedAt,
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
