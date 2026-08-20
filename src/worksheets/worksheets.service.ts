import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';

@Injectable()
export class WorksheetsService {
  constructor(private prisma: PrismaService) {}

  async findAll(teacherId?: string) {
    const where: any = { deletedAt: null };
    if (teacherId) {
      where.teacherId = teacherId;
    }

    const worksheets = await this.prisma.worksheet.findMany({
      where,
      include: {
        subject: true,
        grade: true,
        questions: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return worksheets.map((w) => this.mapWorksheet(w));
  }

  async findOne(id: string, teacherId?: string) {
    const worksheet = await this.prisma.worksheet.findUnique({
      where: { id },
      include: {
        subject: true,
        grade: true,
        questions: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!worksheet || worksheet.deletedAt) {
      throw new NotFoundException(`Không tìm thấy phiếu học tập ${id}`);
    }

    if (teacherId && worksheet.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền truy cập phiếu học tập này');
    }

    return this.mapWorksheet(worksheet);
  }

  async create(dto: CreateWorksheetDto, teacherId: string) {
    const worksheet = await this.prisma.worksheet.create({
      data: {
        teacherId,
        title: dto.title,
        subtitle: dto.subtitle || 'Toán · Lớp 4',
        status: dto.status || 'Bản nháp',
        meta: dto.meta || '10 câu hỏi · Vừa tạo',
        tone: dto.tone || 'teal',
        description: dto.description,
        subjectId: dto.subjectId,
        gradeId: dto.gradeId,
      },
    });

    return this.mapWorksheet(worksheet);
  }

  async update(id: string, dto: UpdateWorksheetDto, teacherId: string) {
    await this.findOne(id, teacherId);

    const updated = await this.prisma.worksheet.update({
      where: { id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        status: dto.status,
        meta: dto.meta,
        tone: dto.tone,
        description: dto.description,
      },
    });

    return this.mapWorksheet(updated);
  }

  async remove(id: string, teacherId: string) {
    await this.findOne(id, teacherId);

    await this.prisma.worksheet.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Đã xóa phiếu học tập' };
  }

  async duplicate(id: string, teacherId: string) {
    const original = await this.findOne(id, teacherId);

    const copy = await this.prisma.worksheet.create({
      data: {
        teacherId,
        title: `${original.title} (Bản sao)`,
        subtitle: original.subtitle,
        status: 'Bản nháp',
        meta: 'Vừa nhân bản',
        tone: original.tone || 'teal',
      },
    });

    return this.mapWorksheet(copy);
  }

  private mapWorksheet(w: any) {
    return {
      id: w.id,
      title: w.title,
      subtitle: w.subtitle || `${w.subject?.name || 'Toán'} · ${w.grade?.name || 'Lớp 4'}`,
      status: w.status || 'Đã xuất bản',
      meta: w.meta || `${w.questions?.length || 10} câu hỏi`,
      tone: w.tone || 'teal',
      questionsCount: w.questions?.length || 0,
    };
  }
}
