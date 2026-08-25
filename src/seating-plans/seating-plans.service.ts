import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import { CreateSeatingPlanDto, SeatingPositionInput, UpdateSeatingPlanDto } from './dto/seating-plan.dto';
@Injectable()
export class SeatingPlansService {
  constructor(private readonly prisma: PrismaService, private readonly classroomAccess: TeachingAssignmentAuthorizationService) {}
  async findAll(classroomId: string, teacherId: string) {
    await this.classroomAccess.assertTeacherCanAccessClassroom(classroomId, teacherId);
    const plans = await this.prisma.seatingPlan.findMany({ where: { classroomId, teacherId }, orderBy: { updatedAt: 'desc' } });
    return Promise.all(plans.map(async (plan) => this.mapPlan(await this.loadPlanWithStudents(plan))));
  }
  async findOne(id: string, teacherId: string) {
    const plan = await this.getOwnedPlan(id, teacherId);
    await this.classroomAccess.assertTeacherCanAccessClassroom(plan.classroomId, teacherId);
    return this.mapPlan(await this.loadPlanWithStudents(plan));
  }
  async create(dto: CreateSeatingPlanDto & { classroomId: string }, teacherId: string) {
    await this.classroomAccess.assertTeacherCanAccessClassroom(dto.classroomId, teacherId);
    const seatsPerDesk = dto.seatsPerDesk ?? 2;
    const layout = await this.validateLayout(dto.classroomId, dto.rows, dto.columns, seatsPerDesk, dto.layout || []);
    try {
      const plan = await this.prisma.seatingPlan.create({ data: { teacherId, classroomId: dto.classroomId, name: dto.name.trim(), rows: dto.rows, columns: dto.columns, seatsPerDesk, layout: layout as any } });
      return this.mapPlan(await this.loadPlanWithStudents(plan));
    } catch (e: any) { if (e?.code === 'P2002') throw new ConflictException('SEATING_PLAN_ALREADY_EXISTS'); throw e; }
  }
  async update(id: string, dto: UpdateSeatingPlanDto, teacherId: string) {
    const current = await this.getOwnedPlan(id, teacherId);
    const rows = dto.rows ?? current.rows, columns = dto.columns ?? current.columns;
    const seatsPerDesk = dto.seatsPerDesk ?? current.seatsPerDesk ?? 2;
    const layout = dto.layout ? await this.validateLayout(current.classroomId, rows, columns, seatsPerDesk, dto.layout) : current.layout;
    try {
      const plan = await this.prisma.seatingPlan.update({ where: { id }, data: { ...(dto.name ? { name: dto.name.trim() } : {}), rows, columns, seatsPerDesk, layout: layout as any } });
      return this.mapPlan(await this.loadPlanWithStudents(plan));
    } catch (e: any) { if (e?.code === 'P2002') throw new ConflictException('SEATING_PLAN_ALREADY_EXISTS'); throw e; }
  }
  async randomize(id: string, teacherId: string) {
    const current = await this.getOwnedPlan(id, teacherId), students = await this.activeStudents(current.classroomId), capacity = current.rows * current.columns * (current.seatsPerDesk ?? 2);
    const seats = Array.from({ length: capacity }, (_, i) => ({ row: Math.floor(i / (current.columns * (current.seatsPerDesk ?? 2))), column: Math.floor(i / (current.seatsPerDesk ?? 2)) % current.columns, seatIndex: i % (current.seatsPerDesk ?? 2) }));
    const layout = [...students].sort(() => Math.random() - 0.5).slice(0, capacity).map((s, i) => ({ studentId: s.id, ...seats[i] }));
    const updated = await this.prisma.seatingPlan.update({ where: { id }, data: { layout } });
    return this.mapPlan(await this.loadPlanWithStudents(updated));
  }
  async reset(id: string, teacherId: string) { await this.getOwnedPlan(id, teacherId); const updated = await this.prisma.seatingPlan.update({ where: { id }, data: { layout: [] } }); return this.mapPlan(await this.loadPlanWithStudents(updated)); }
  async remove(id: string, teacherId: string) { await this.getOwnedPlan(id, teacherId); await this.prisma.seatingPlan.delete({ where: { id } }); return { success: true }; }
  private async getOwnedPlan(id: string, teacherId: string) { const plan = await this.prisma.seatingPlan.findUnique({ where: { id } }); if (!plan) throw new NotFoundException('SEATING_PLAN_NOT_FOUND'); if (plan.teacherId !== teacherId) throw new ForbiddenException('BẠN KHÔNG CÓ QUYỀN TRUY CẬP SƠ ĐỒ NÀY'); return plan; }
  private async activeStudents(classroomId: string) { const rows = await this.prisma.studentEnrollment.findMany({ where: { classroomId, status: 'ACTIVE', classroom: { isActive: true, deletedAt: null }, student: { deletedAt: null } }, select: { student: { select: { id: true, fullName: true, initials: true } } }, orderBy: { student: { fullName: 'asc' } } }); return rows.map((r) => r.student); }
  private async validateLayout(classroomId: string, rows: number, columns: number, seatsPerDesk: number, layout: SeatingPositionInput[]) {
    if (!Array.isArray(layout)) throw new BadRequestException('INVALID_SEATING_LAYOUT');
    const valid = new Set((await this.activeStudents(classroomId)).map((s) => s.id)), students = new Set<string>(), seats = new Set<string>();
    for (const p of layout) {
      if (!p?.studentId || !valid.has(p.studentId)) throw new BadRequestException('INVALID_STUDENT_ENROLLMENT');
      if (!Number.isInteger(p.row) || !Number.isInteger(p.column)) throw new BadRequestException('INVALID_SEATING_POSITION');
      const seatIndex = p.seatIndex ?? 0;
      if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= seatsPerDesk || p.row < 0 || p.row >= rows || p.column < 0 || p.column >= columns) throw new BadRequestException('SEATING_POSITION_OUT_OF_BOUNDS');
      const key = `${p.row}:${p.column}:${seatIndex}`;
      if (students.has(p.studentId)) throw new ConflictException('STUDENT_ALREADY_SEATED');
      if (seats.has(key)) throw new ConflictException('SEATING_POSITION_OCCUPIED');
      students.add(p.studentId); seats.add(key); (p as any).seatIndex = seatIndex;
    }
    return layout;
  }
  private async loadPlanWithStudents(plan: any) { const rows = await this.prisma.studentEnrollment.findMany({ where: { classroomId: plan.classroomId, student: { deletedAt: null } }, select: { status: true, student: { select: { id: true, fullName: true, initials: true, avatarColor: true } } }, orderBy: { student: { fullName: 'asc' } } }); return { ...plan, students: rows.map((r) => ({ ...r.student, enrollmentStatus: r.status })) }; }
  private mapPlan(plan: any) { const students = plan.students || [], byId = new Map(students.map((s: any) => [s.id, s])); return { ...plan, seatsPerDesk: plan.seatsPerDesk ?? 2, layout: Array.isArray(plan.layout) ? plan.layout.map((p: any) => ({ ...p, seatIndex: p.seatIndex ?? 0, student: byId.get(p.studentId) || null, stale: !byId.has(p.studentId) })) : [], students }; }
}