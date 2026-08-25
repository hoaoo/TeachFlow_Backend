import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolYearDto } from './dto/create-school-year.dto';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';
import { RolloverSchoolYearDto } from './dto/rollover-school-year.dto';

@Injectable()
export class SchoolYearsService {
  private readonly logger = new Logger(SchoolYearsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query?: { keyword?: string; isActive?: boolean }) {
    const where: any = {};

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.keyword) {
      where.name = { contains: query.keyword.trim(), mode: 'insensitive' };
    }

    return this.prisma.schoolYear.findMany({
      where,
      include: {
        semesters: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            classrooms: true,
            semesters: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async getCurrent() {
    const current = await this.prisma.schoolYear.findFirst({
      where: { isCurrent: true, isActive: true },
      include: {
        semesters: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!current) {
      // Fallback to latest active school year
      const latest = await this.prisma.schoolYear.findFirst({
        where: { isActive: true },
        orderBy: { startDate: 'desc' },
        include: {
          semesters: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!latest) {
        throw new NotFoundException('Chưa có năm học nào được thiết lập trong hệ thống');
      }

      return latest;
    }

    return current;
  }

  async findOne(id: string) {
    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id },
      include: {
        semesters: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            classrooms: true,
            semesters: true,
            teachingPlans: true,
            assessments: true,
          },
        },
      },
    });

    if (!schoolYear) {
      throw new NotFoundException(`Không tìm thấy năm học với mã ${id}`);
    }

    return schoolYear;
  }

  async create(dto: CreateSchoolYearDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException('Ngày bắt đầu năm học phải trước ngày kết thúc');
    }

    const existingName = await this.prisma.schoolYear.findUnique({
      where: { name: dto.name.trim() },
    });

    if (existingName) {
      throw new ConflictException(`Năm học "${dto.name}" đã tồn tại trong hệ thống`);
    }

    if (dto.isCurrent) {
      return this.prisma.$transaction(async (tx) => {
        await tx.schoolYear.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        });

        return tx.schoolYear.create({
          data: {
            name: dto.name.trim(),
            startDate,
            endDate,
            isCurrent: true,
            isActive: dto.isActive !== undefined ? dto.isActive : true,
          },
          include: {
            semesters: true,
          },
        });
      });
    }

    return this.prisma.schoolYear.create({
      data: {
        name: dto.name.trim(),
        startDate,
        endDate,
        isCurrent: false,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
      include: {
        semesters: true,
      },
    });
  }

  async update(id: string, dto: UpdateSchoolYearDto) {
    const existing = await this.findOne(id);

    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;

    if (startDate >= endDate) {
      throw new BadRequestException('Ngày bắt đầu năm học phải trước ngày kết thúc');
    }

    if (dto.name && dto.name.trim() !== existing.name) {
      const duplicateName = await this.prisma.schoolYear.findUnique({
        where: { name: dto.name.trim() },
      });
      if (duplicateName && duplicateName.id !== id) {
        throw new ConflictException(`Năm học "${dto.name}" đã tồn tại trong hệ thống`);
      }
    }

    if (dto.isCurrent === true) {
      return this.prisma.$transaction(async (tx) => {
        await tx.schoolYear.updateMany({
          where: { isCurrent: true, id: { not: id } },
          data: { isCurrent: false },
        });

        return tx.schoolYear.update({
          where: { id },
          data: {
            name: dto.name ? dto.name.trim() : undefined,
            startDate: dto.startDate ? startDate : undefined,
            endDate: dto.endDate ? endDate : undefined,
            isCurrent: true,
            isActive: dto.isActive !== undefined ? dto.isActive : true,
          },
          include: {
            semesters: true,
          },
        });
      });
    }

    return this.prisma.schoolYear.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        startDate: dto.startDate ? startDate : undefined,
        endDate: dto.endDate ? endDate : undefined,
        isCurrent: dto.isCurrent !== undefined ? dto.isCurrent : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
      include: {
        semesters: true,
      },
    });
  }

  async setCurrent(id: string) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.schoolYear.updateMany({
        where: { isCurrent: true, id: { not: id } },
        data: { isCurrent: false },
      });

      return tx.schoolYear.update({
        where: { id },
        data: { isCurrent: true, isActive: true },
        include: {
          semesters: true,
        },
      });
    });
  }

  async closeSchoolYear(id: string) {
    const existing = await this.findOne(id);

    return this.prisma.schoolYear.update({
      where: { id },
      data: {
        isActive: false,
        isCurrent: false,
      },
      include: {
        semesters: true,
      },
    });
  }

  async rolloverSchoolYear(dto: RolloverSchoolYearDto, scopedTeacherId?: string) {
    const sourceYear = await this.findOne(dto.sourceSchoolYearId);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException('Ngày bắt đầu năm học mới phải trước ngày kết thúc');
    }

    const duplicateName = await this.prisma.schoolYear.findUnique({
      where: { name: dto.name.trim() },
    });

    if (duplicateName) {
      throw new ConflictException(`Năm học "${dto.name}" đã tồn tại trong hệ thống`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. If set as current, unset current flag on existing years
      if (dto.setAsCurrent) {
        await tx.schoolYear.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        });
      }

      // 2. If closeSourceYear, mark source school year as closed/inactive
      if (dto.closeSourceYear) {
        await tx.schoolYear.update({
          where: { id: dto.sourceSchoolYearId },
          data: { isCurrent: false, isActive: false },
        });
      }

      // 3. Create the new SchoolYear
      const newYear = await tx.schoolYear.create({
        data: {
          name: dto.name.trim(),
          startDate,
          endDate,
          isCurrent: dto.setAsCurrent !== undefined ? dto.setAsCurrent : true,
          isActive: true,
          semesters: {
            create: [
              {
                code: 'HK1',
                name: 'Học kỳ 1',
                startDate,
                endDate: new Date(startDate.getTime() + 120 * 24 * 60 * 60 * 1000),
                sortOrder: 1,
                isActive: true,
              },
              {
                code: 'HK2',
                name: 'Học kỳ 2',
                startDate: new Date(startDate.getTime() + 121 * 24 * 60 * 60 * 1000),
                endDate,
                sortOrder: 2,
                isActive: false,
              },
            ],
          },
        },
        include: {
          semesters: true,
        },
      });

      let copiedClassroomsCount = 0;
      let copiedSubjectsCount = 0;

      // 4. Selective copy of Classrooms & Subject configurations (NO historical attendance, assessments, or enrollments)
      if (dto.copyClassrooms) {
        const classroomWhere: any = {
          schoolYearId: dto.sourceSchoolYearId,
          deletedAt: null,
        };
        if (scopedTeacherId) {
          classroomWhere.OR = [
            { teacherId: scopedTeacherId },
            { homeroomTeacherId: scopedTeacherId },
          ];
        }

        const sourceClassrooms = await tx.classroom.findMany({
          where: classroomWhere,
          include: {
            classSubjects: true,
          },
        });

        for (const srcClass of sourceClassrooms) {
          const newClass = await tx.classroom.create({
            data: {
              name: srcClass.name,
              code: srcClass.code,
              gradeId: srcClass.gradeId,
              schoolYearId: newYear.id,
              teacherId: srcClass.teacherId,
              homeroomTeacherId: srcClass.homeroomTeacherId,
              room: srcClass.room,
              schedule: srcClass.schedule,
              accent: srcClass.accent || 'teal',
              status: 'ACTIVE',
              isActive: true,
            },
          });
          copiedClassroomsCount++;

          if (dto.copyClassSubjects && srcClass.classSubjects?.length) {
            for (const cs of srcClass.classSubjects) {
              await tx.classSubject.create({
                data: {
                  classroomId: newClass.id,
                  subjectId: cs.subjectId,
                  isActive: cs.isActive,
                },
              });
              copiedSubjectsCount++;
            }
          }
        }
      }

      this.logger.log(
        `[SCHOOL_YEAR_ROLLOVER] source="${sourceYear.name}" -> target="${newYear.name}", classrooms=${copiedClassroomsCount}, subjects=${copiedSubjectsCount}`,
      );

      return {
        schoolYear: newYear,
        summary: {
          sourceYearName: sourceYear.name,
          newYearName: newYear.name,
          copiedClassroomsCount,
          copiedSubjectsCount,
          sourceClosed: !!dto.closeSourceYear,
          isCurrent: newYear.isCurrent,
        },
      };
    });
  }

  async remove(id: string) {
    const existing = await this.findOne(id);

    const counts = await this.prisma.schoolYear.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            classrooms: true,
            teachingPlans: true,
            assessments: true,
            weeklyClassReviews: true,
            monthlyClassReviews: true,
          },
        },
      },
    });

    const totalReferenced =
      (counts?._count.classrooms || 0) +
      (counts?._count.teachingPlans || 0) +
      (counts?._count.assessments || 0) +
      (counts?._count.weeklyClassReviews || 0) +
      (counts?._count.monthlyClassReviews || 0);

    if (totalReferenced > 0) {
      throw new ConflictException(
        `Không thể xóa năm học "${existing.name}" vì đang có ${totalReferenced} bản ghi lớp học/kế hoạch/đánh giá liên kết. Vui lòng chuyển trạng thái sang không hoạt động.`,
      );
    }

    return this.prisma.schoolYear.delete({
      where: { id },
    });
  }
}
