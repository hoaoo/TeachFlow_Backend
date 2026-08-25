import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAssignmentAuthorizationService } from '../common/services/teaching-assignment-authorization.service';
import {
  CreateSeatingPlanDto,
  UpdateSeatingPlanDto,
  CanvasDesk,
  CanvasLayout,
} from './dto/seating-plan.dto';

@Injectable()
export class SeatingPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classroomAccess: TeachingAssignmentAuthorizationService,
  ) {}

  async findAll(classroomId: string, teacherId: string) {
    await this.classroomAccess.assertTeacherCanAccessClassroom(classroomId, teacherId);
    const plans = await this.prisma.seatingPlan.findMany({
      where: { classroomId, teacherId },
      orderBy: { updatedAt: 'desc' },
    });
    return Promise.all(plans.map(async (plan) => this.mapPlan(await this.loadPlanWithStudents(plan))));
  }

  async findOne(id: string, teacherId: string) {
    const plan = await this.getOwnedPlan(id, teacherId);
    await this.classroomAccess.assertTeacherCanAccessClassroom(plan.classroomId, teacherId);
    return this.mapPlan(await this.loadPlanWithStudents(plan));
  }

  async create(dto: CreateSeatingPlanDto & { classroomId: string }, teacherId: string) {
    await this.classroomAccess.assertTeacherCanAccessClassroom(dto.classroomId, teacherId);
    const rows = dto.rows ?? 4;
    const columns = dto.columns ?? 3;
    const seatsPerDesk = dto.seatsPerDesk ?? 2;
    const validatedLayout = await this.validateLayout(
      dto.classroomId,
      rows,
      columns,
      seatsPerDesk,
      dto.layout,
    );

    try {
      const plan = await this.prisma.seatingPlan.create({
        data: {
          teacherId,
          classroomId: dto.classroomId,
          name: dto.name.trim(),
          rows,
          columns,
          seatsPerDesk,
          layout: validatedLayout as any,
        },
      });
      return this.mapPlan(await this.loadPlanWithStudents(plan));
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('SEATING_PLAN_ALREADY_EXISTS');
      throw e;
    }
  }

  async update(id: string, dto: UpdateSeatingPlanDto, teacherId: string) {
    const current = await this.getOwnedPlan(id, teacherId);
    await this.classroomAccess.assertTeacherCanAccessClassroom(current.classroomId, teacherId);

    const rows = dto.rows ?? current.rows;
    const columns = dto.columns ?? current.columns;
    const seatsPerDesk = dto.seatsPerDesk ?? current.seatsPerDesk ?? 2;
    const validatedLayout =
      dto.layout !== undefined
        ? await this.validateLayout(current.classroomId, rows, columns, seatsPerDesk, dto.layout)
        : current.layout;

    try {
      const plan = await this.prisma.seatingPlan.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          rows,
          columns,
          seatsPerDesk,
          layout: validatedLayout as any,
        },
      });
      return this.mapPlan(await this.loadPlanWithStudents(plan));
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('SEATING_PLAN_ALREADY_EXISTS');
      throw e;
    }
  }

  async randomize(id: string, teacherId: string) {
    const current = await this.getOwnedPlan(id, teacherId);
    await this.classroomAccess.assertTeacherCanAccessClassroom(current.classroomId, teacherId);

    const students = await this.activeStudents(current.classroomId);
    const shuffledStudents = [...students].sort(() => Math.random() - 0.5);

    const layoutObj = current.layout as any;
    if (layoutObj && Array.isArray(layoutObj.desks)) {
      let studentIndex = 0;
      const updatedDesks = layoutObj.desks.map((desk: CanvasDesk) => {
        const capacity = Math.max(1, Math.min(4, desk.seatCapacity || 2));
        const newSeats = Array.from({ length: capacity }, (_, pos) => {
          const student = studentIndex < shuffledStudents.length ? shuffledStudents[studentIndex++] : null;
          return {
            position: pos,
            studentId: student ? student.id : null,
          };
        });
        return {
          ...desk,
          seatCapacity: capacity,
          seats: newSeats,
        };
      });

      const updated = await this.prisma.seatingPlan.update({
        where: { id },
        data: {
          layout: {
            ...layoutObj,
            desks: updatedDesks,
          },
        },
      });
      return this.mapPlan(await this.loadPlanWithStudents(updated));
    }

    // Fallback legacy grid randomization
    const capacity = current.rows * current.columns * (current.seatsPerDesk ?? 2);
    const seats = Array.from({ length: capacity }, (_, i) => ({
      row: Math.floor(i / (current.columns * (current.seatsPerDesk ?? 2))),
      column: Math.floor(i / (current.seatsPerDesk ?? 2)) % current.columns,
      seatIndex: i % (current.seatsPerDesk ?? 2),
    }));
    const legacyLayout = shuffledStudents.slice(0, capacity).map((s, i) => ({
      studentId: s.id,
      ...seats[i],
    }));

    const updated = await this.prisma.seatingPlan.update({
      where: { id },
      data: { layout: legacyLayout },
    });
    return this.mapPlan(await this.loadPlanWithStudents(updated));
  }

  async reset(id: string, teacherId: string) {
    const current = await this.getOwnedPlan(id, teacherId);
    await this.classroomAccess.assertTeacherCanAccessClassroom(current.classroomId, teacherId);

    const layoutObj = current.layout as any;
    let nextLayout: any = [];
    if (layoutObj && Array.isArray(layoutObj.desks)) {
      nextLayout = {
        ...layoutObj,
        desks: layoutObj.desks.map((desk: CanvasDesk) => ({
          ...desk,
          seats: Array.from({ length: desk.seatCapacity || 2 }, (_, pos) => ({
            position: pos,
            studentId: null,
          })),
        })),
      };
    }

    const updated = await this.prisma.seatingPlan.update({
      where: { id },
      data: { layout: nextLayout },
    });
    return this.mapPlan(await this.loadPlanWithStudents(updated));
  }

  async remove(id: string, teacherId: string) {
    await this.getOwnedPlan(id, teacherId);
    await this.prisma.seatingPlan.delete({ where: { id } });
    return { success: true };
  }

  private async getOwnedPlan(id: string, teacherId: string) {
    const plan = await this.prisma.seatingPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('SEATING_PLAN_NOT_FOUND');
    if (plan.teacherId !== teacherId) {
      throw new ForbiddenException('BẠN KHÔNG CÓ QUYỀN TRUY CẬP SƠ ĐỒ NÀY');
    }
    return plan;
  }

  private async activeStudents(classroomId: string) {
    const rows = await this.prisma.studentEnrollment.findMany({
      where: {
        classroomId,
        status: 'ACTIVE',
        classroom: { isActive: true, deletedAt: null },
        student: { deletedAt: null },
      },
      select: {
        student: {
          select: {
            id: true,
            fullName: true,
            studentCode: true,
            initials: true,
            avatarColor: true,
            gender: true,
          },
        },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
    return rows.map((r) => r.student);
  }

  private async validateLayout(
    classroomId: string,
    rows: number,
    columns: number,
    seatsPerDesk: number,
    layout: any,
  ) {
    if (!layout) {
      return { canvas: { width: 1200, height: 800 }, desks: [] };
    }

    const validStudents = new Set((await this.activeStudents(classroomId)).map((s) => s.id));
    const seatedStudentIds = new Set<string>();

    // 1. Structured Canvas Layout: { canvas?, desks: [...] }
    if (typeof layout === 'object' && Array.isArray(layout.desks)) {
      const validatedDesks: CanvasDesk[] = [];

      for (let i = 0; i < layout.desks.length; i++) {
        const desk = layout.desks[i];
        if (!desk || typeof desk !== 'object') continue;

        const deskId = desk.id || `desk-${i + 1}`;
        const deskName = desk.name || `Bàn ${i + 1}`;
        const x = typeof desk.x === 'number' ? desk.x : 100;
        const y = typeof desk.y === 'number' ? desk.y : 100;
        const seatCapacity = Math.max(1, Math.min(4, Number(desk.seatCapacity) || 2));

        const seats = Array.isArray(desk.seats) ? desk.seats : [];
        const validatedSeats = [];

        for (let p = 0; p < seatCapacity; p++) {
          const seat = seats.find((s: any) => s && s.position === p);
          const studentId = seat?.studentId || null;

          if (studentId) {
            if (!validStudents.has(studentId)) {
              throw new BadRequestException('INVALID_STUDENT_ENROLLMENT');
            }
            if (seatedStudentIds.has(studentId)) {
              throw new ConflictException('STUDENT_ALREADY_SEATED');
            }
            seatedStudentIds.add(studentId);
          }

          validatedSeats.push({
            position: p,
            studentId,
          });
        }

        validatedDesks.push({
          id: deskId,
          name: deskName,
          x,
          y,
          width: desk.width || (seatCapacity === 1 ? 110 : seatCapacity === 4 ? 200 : 160),
          height: desk.height || (seatCapacity === 4 ? 120 : 90),
          seatCapacity,
          seats: validatedSeats,
        });
      }

      return {
        canvas: layout.canvas || { width: 1200, height: 800 },
        desks: validatedDesks,
      };
    }

    // 2. Legacy Array Layout: [ { studentId, row, column, seatIndex } ]
    if (Array.isArray(layout)) {
      const seats = new Set<string>();
      for (const p of layout) {
        if (!p?.studentId || !validStudents.has(p.studentId)) {
          throw new BadRequestException('INVALID_STUDENT_ENROLLMENT');
        }
        if (!Number.isInteger(p.row) || !Number.isInteger(p.column)) {
          throw new BadRequestException('INVALID_SEATING_POSITION');
        }
        const seatIndex = p.seatIndex ?? 0;
        if (
          !Number.isInteger(seatIndex) ||
          seatIndex < 0 ||
          seatIndex >= seatsPerDesk ||
          p.row < 0 ||
          p.row >= rows ||
          p.column < 0 ||
          p.column >= columns
        ) {
          throw new BadRequestException('SEATING_POSITION_OUT_OF_BOUNDS');
        }
        const key = `${p.row}:${p.column}:${seatIndex}`;
        if (seatedStudentIds.has(p.studentId)) throw new ConflictException('STUDENT_ALREADY_SEATED');
        if (seats.has(key)) throw new ConflictException('SEATING_POSITION_OCCUPIED');
        seatedStudentIds.add(p.studentId);
        seats.add(key);
        p.seatIndex = seatIndex;
      }
      return layout;
    }

    return { canvas: { width: 1200, height: 800 }, desks: [] };
  }

  private async loadPlanWithStudents(plan: any) {
    const rows = await this.prisma.studentEnrollment.findMany({
      where: {
        classroomId: plan.classroomId,
        status: 'ACTIVE',
        student: { deletedAt: null },
      },
      select: {
        status: true,
        student: {
          select: {
            id: true,
            fullName: true,
            studentCode: true,
            initials: true,
            avatarColor: true,
            gender: true,
          },
        },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
    return {
      ...plan,
      students: rows.map((r) => ({ ...r.student, enrollmentStatus: r.status })),
    };
  }

  private mapPlan(plan: any) {
    const students = plan.students || [];
    const byId = new Map(students.map((s: any) => [s.id, s]));

    const layout = plan.layout;
    let mappedLayout: any = layout;

    if (layout && typeof layout === 'object' && Array.isArray(layout.desks)) {
      mappedLayout = {
        ...layout,
        desks: layout.desks.map((desk: CanvasDesk) => ({
          ...desk,
          seats: (desk.seats || []).map((seat) => ({
            ...seat,
            student: seat.studentId ? byId.get(seat.studentId) || null : null,
            stale: seat.studentId ? !byId.has(seat.studentId) : false,
          })),
        })),
      };
    } else if (Array.isArray(layout)) {
      mappedLayout = layout.map((p: any) => ({
        ...p,
        seatIndex: p.seatIndex ?? 0,
        student: byId.get(p.studentId) || null,
        stale: !byId.has(p.studentId),
      }));
    }

    return {
      ...plan,
      seatsPerDesk: plan.seatsPerDesk ?? 2,
      layout: mappedLayout,
      students,
    };
  }
}