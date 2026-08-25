import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}
  findAll(teacherId: string, type?: string) { return this.prisma.teacherTemplate.findMany({ where: { teacherId, ...(type ? { type } : {}) }, orderBy: { updatedAt: 'desc' } }); }
  async findOne(id: string, teacherId: string) {
    const item = await this.prisma.teacherTemplate.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('TEMPLATE_NOT_FOUND');
    if (item.teacherId !== teacherId) throw new ForbiddenException('Bạn không có quyền truy cập mẫu này');
    return item;
  }
  create(dto: CreateTemplateDto, teacherId: string) { return this.prisma.teacherTemplate.create({ data: { teacherId, type: dto.type, name: dto.name.trim(), description: dto.description?.trim() || null, content: dto.content as any } }); }
  async update(id: string, dto: UpdateTemplateDto, teacherId: string) { await this.findOne(id, teacherId); return this.prisma.teacherTemplate.update({ where: { id }, data: { name: dto.name?.trim(), description: dto.description === undefined ? undefined : dto.description.trim() || null, content: dto.content as any } }); }
  async remove(id: string, teacherId: string) { await this.findOne(id, teacherId); await this.prisma.teacherTemplate.delete({ where: { id } }); return { success: true }; }

  async saveLessonPlan(lessonPlanId: string, name: string | undefined, teacherId: string) {
    const s = await this.prisma.lessonPlan.findFirst({ where: { id: lessonPlanId, teacherId, deletedAt: null }, include: { activities: { orderBy: { sortOrder: 'asc' } } } });
    if (!s) throw new NotFoundException('LESSON_PLAN_NOT_FOUND');
    return this.create({ type: 'LESSON_PLAN', name: name?.trim() || s.title, content: { title: s.title, topic: s.topic, subjectId: s.subjectId, subjectName: s.subjectName, gradeName: s.gradeName, durationMinutes: s.durationMinutes, objectives: s.objectives, specificCompetencies: s.specificCompetencies, generalCompetencies: s.generalCompetencies, qualities: s.qualities, teachingEquipment: s.teachingEquipment, notes: s.notes, activities: s.activities } }, teacherId);
  }
  async saveWorksheet(worksheetId: string, name: string | undefined, teacherId: string) {
    const s = await this.prisma.worksheet.findFirst({ where: { id: worksheetId, teacherId, deletedAt: null }, include: { questions: { orderBy: { sortOrder: 'asc' } } } });
    if (!s) throw new NotFoundException('WORKSHEET_NOT_FOUND');
    return this.create({ type: 'WORKSHEET', name: name?.trim() || s.title, content: { title: s.title, subtitle: s.subtitle, description: s.description, subjectId: s.subjectId, gradeId: s.gradeId, tone: s.tone, questions: s.questions } }, teacherId);
  }
  async use(id: string, teacherId: string) {
    const t = await this.findOne(id, teacherId), c: any = t.content || {};
    if (t.type === 'WORKSHEET') {
      const draft = await this.prisma.worksheet.create({ data: { teacherId, title: `${c.title || t.name} (Bản nháp)`, subtitle: c.subtitle || null, description: c.description || null, status: 'DRAFT', meta: 'Tạo từ mẫu cá nhân', tone: c.tone || 'teal', subjectId: c.subjectId || null, gradeId: c.gradeId || null, questions: Array.isArray(c.questions) ? { create: c.questions.map((q: any, i: number) => ({ questionType: q.questionType || 'MULTIPLE_CHOICE', content: q.content, optionsJson: q.optionsJson || q.options || [], correctAnswerJson: q.correctAnswerJson ?? q.correctAnswer ?? null, explanation: q.explanation || null, sortOrder: q.sortOrder ?? i })) } : undefined }, include: { questions: { orderBy: { sortOrder: 'asc' } } } });
      return { type: t.type, templateId: id, draft };
    }
    if (t.type === 'LESSON_PLAN') {
      const draft = await this.prisma.lessonPlan.create({ data: { teacherId, title: `${c.title || t.name} (Bản nháp)`, topic: c.topic || null, subjectId: c.subjectId || null, subjectName: c.subjectName || null, gradeName: c.gradeName || null, durationMinutes: c.durationMinutes || 40, objectives: c.objectives || null, specificCompetencies: c.specificCompetencies || null, generalCompetencies: c.generalCompetencies || null, qualities: c.qualities || null, teachingEquipment: c.teachingEquipment || null, notes: c.notes || null, status: 'DRAFT', sourceType: 'NATIVE', activities: Array.isArray(c.activities) ? { create: c.activities.map((a: any, i: number) => ({ activityType: a.activityType || 'OTHER', phase: a.phase || 'Hoạt động', title: a.title, objective: a.objective || null, durationMinutes: a.durationMinutes || 5, method: a.method || null, technique: a.technique || null, competencies: a.competencies || null, qualities: a.qualities || null, equipment: a.equipment || null, teacherActivity: a.teacherActivity || null, studentActivity: a.studentActivity || null, sortOrder: a.sortOrder ?? i })) } : undefined }, include: { activities: { orderBy: { sortOrder: 'asc' } } } });
      return { type: t.type, templateId: id, draft };
    }
    return { type: t.type, templateId: id, draft: c };
  }
}
