import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateLibraryActivityDto } from './dto/create-activity.dto';
import { UpdateLibraryActivityDto } from './dto/update-activity.dto';

const DEFAULT_STARTER_ACTIVITIES = [
  {
    id: 'seed-act-1',
    title: 'Bingo phân số bằng nhau',
    typeName: 'Trò chơi',
    subjectName: 'Toán',
    gradeName: 'Lớp 4',
    durationMinutes: 10,
    objective: 'Củng cố quy tắc và sự nhanh nhạy khi nhận diện các phân số bằng nhau.',
    method: 'Trò chơi học tập, thảo luận nhóm đôi',
    technique: 'Tia chớp, Think-Pair-Share',
    competencies: 'Năng lực tư duy và lập luận toán học, giao tiếp và hợp tác',
    qualities: 'Chăm chỉ, trung thực',
    equipment: 'Bảng bingo, thẻ số ngẫu nhiên, bút dạ',
    teacherActivity: 'GV phát phiếu Bingo cho từng bàn, quay số ngẫu nhiên và đọc phân số. Hướng dẫn học sinh kiểm tra chéo kết quả.',
    studentActivity: 'HS quan sát phân số nhận được, tìm và đánh dấu phân số bằng nhau trên bảng của mình. Ai tạo thành hàng ngang/dọc/chéo thì hô Bingo.',
    gameRules: 'Mỗi học sinh có bảng 3x3 chứa 9 phân số. Khi GV đọc 1 phân số, HS tìm phân số bằng nó để gạch. Đạt 3 ô thẳng hàng là chiến thắng.',
    description: 'Trò chơi Bingo tương tác cao giúp học sinh hào hứng củng cố phân số.',
    icon: 'Grid2X2',
    usesCount: 128,
    isPublic: true,
    isSystem: true,
  },
  {
    id: 'seed-act-2',
    title: 'Chiếc hộp bí mật',
    typeName: 'Khởi động',
    subjectName: 'Tiếng Việt',
    gradeName: 'Lớp 4',
    durationMinutes: 5,
    objective: 'Kích thích trí tò mò, tạo hứng thú và kết nối vào chủ đề bài học.',
    method: 'Trực quan, gợi mở',
    technique: 'Động não, Khăn trải bàn',
    competencies: 'Năng lực ngôn ngữ, giải quyết vấn đề',
    qualities: 'Chăm chỉ, tự tin',
    equipment: 'Chiếc hộp có lỗ luồn tay, đồ vật liên quan bài học',
    teacherActivity: 'GV đưa ra chiếc hộp bí mật, mời 1-2 học sinh lên sờ đồ vật và mô tả cảm giác bằng các tính từ/từ ngữ gợi cảm.',
    studentActivity: 'HS đại diện dùng từ ngữ miêu tả đặc điểm đồ vật trong hộp; cả lớp cùng suy đoán và gọi tên đồ vật để dẫn vào bài mới.',
    gameRules: 'Không được nhìn vào trong hộp, chỉ dùng xúc giác để cảm nhận và diễn đạt bằng lời nói.',
    description: 'Hoạt động mở đầu bài học đầy bất ngờ và hứng thú cho học sinh.',
    icon: 'Gift',
    usesCount: 96,
    isPublic: true,
    isSystem: true,
  },
  {
    id: 'seed-act-3',
    title: 'Mảnh ghép khám phá khoa học',
    typeName: 'Khám phá',
    subjectName: 'Khoa học',
    gradeName: 'Lớp 4',
    durationMinutes: 15,
    objective: 'Hình thành kiến thức mới qua hợp tác nhóm chuyên gia và nhóm mảnh ghép.',
    method: 'Dạy học hợp tác, giải quyết vấn đề',
    technique: 'Kĩ thuật mảnh ghép (Jigsaw)',
    competencies: 'Năng lực khoa học, giao tiếp và hợp tác',
    qualities: 'Trách nhiệm, chăm chỉ',
    equipment: 'Phiếu học tập chuyên gia 1, 2, 3 và sơ đồ tổng hợp',
    teacherActivity: 'GV phân chia nhóm chuyên sâu (vòng 1), giao nhiệm vụ nghiên cứu từng phần kiến thức. Điều phối sang nhóm mảnh ghép (vòng 2) để tổng hợp.',
    studentActivity: 'Vòng 1: HS cùng nhóm thảo luận sâu 1 nội dung. Vòng 2: HS tách ra nhóm mới, đóng vai chuyên gia chia sẻ lại kiến thức cho các bạn.',
    description: 'Áp dụng kĩ thuật mảnh ghép giúp 100% học sinh đều phải chủ động tư duy và trình bày.',
    icon: 'Puzzle',
    usesCount: 74,
    isPublic: true,
    isSystem: true,
  },
  {
    id: 'seed-act-4',
    title: 'Phóng viên nhí phỏng vấn',
    typeName: 'Vận dụng',
    subjectName: 'Đạo đức',
    gradeName: 'Lớp 4',
    durationMinutes: 8,
    objective: 'Vận dụng bài học vào liên hệ bản thân và cuộc sống thực tế.',
    method: 'Đóng vai, phỏng vấn',
    technique: 'Phỏng vấn nhanh, Bể cá',
    competencies: 'Năng lực giao tiếp, tự chủ và tự học',
    qualities: 'Yêu nước, nhân ái, trách nhiệm',
    equipment: 'Micro đồ chơi hoặc thẻ phóng viên',
    teacherActivity: 'GV đóng vai trò đạo diễn, mời 2 bạn làm phóng viên đi phỏng vấn các bạn trong lớp về hành động đẹp trong thực tế.',
    studentActivity: 'Phóng viên đặt câu hỏi phỏng vấn, các bạn học sinh trả lời nhanh và nêu cảm nghĩ, bài học rút ra.',
    description: 'Hoạt động đóng vai sinh động phát triển kĩ năng mềm và sự tự tin.',
    icon: 'Mic',
    usesCount: 52,
    isPublic: true,
    isSystem: true,
  },
];

@Injectable()
export class ActivityLibraryService {
  private readonly logger = new Logger(ActivityLibraryService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private auditService?: AuditService,
  ) {}

  async findAll(
    query: {
      subject?: string;
      grade?: string;
      type?: string;
      method?: string;
      technique?: string;
      keyword?: string;
      scope?: 'ALL' | 'MINE' | 'SYSTEM' | string;
      page?: number;
      limit?: number;
    },
    teacherId?: string,
  ) {
    const { subject, grade, type, method, technique, keyword, scope } = query;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 24));
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    // Scope visibility filter
    if (scope === 'MINE') {
      if (teacherId) {
        where.teacherId = teacherId;
      } else {
        where.id = 'none';
      }
    } else if (scope === 'SYSTEM') {
      where.OR = [{ isSystem: true }, { teacherId: null }];
    } else {
      // ALL: public activities OR own activities OR system activities
      if (teacherId) {
        where.OR = [
          { isPublic: true },
          { isSystem: true },
          { teacherId },
        ];
      } else {
        where.OR = [{ isPublic: true }, { isSystem: true }];
      }
    }

    if (subject && subject !== 'Tất cả') {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { subjectName: { contains: subject, mode: 'insensitive' } },
          { subject: { name: { contains: subject, mode: 'insensitive' } } },
        ],
      });
    }

    if (grade && grade !== 'Tất cả') {
      where.AND = where.AND || [];
      where.AND.push({ gradeName: { contains: grade, mode: 'insensitive' } });
    }

    if (type && type !== 'Tất cả') {
      where.AND = where.AND || [];
      where.AND.push({ typeName: { contains: type, mode: 'insensitive' } });
    }

    if (method && method !== 'Tất cả') {
      where.AND = where.AND || [];
      where.AND.push({ method: { contains: method, mode: 'insensitive' } });
    }

    if (technique && technique !== 'Tất cả') {
      where.AND = where.AND || [];
      where.AND.push({ technique: { contains: technique, mode: 'insensitive' } });
    }

    if (keyword && keyword.trim()) {
      const q = keyword.trim();
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { objective: { contains: q, mode: 'insensitive' } },
          { method: { contains: q, mode: 'insensitive' } },
          { technique: { contains: q, mode: 'insensitive' } },
          { teacherActivity: { contains: q, mode: 'insensitive' } },
          { studentActivity: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const [total, activities] = await Promise.all([
      this.prisma.teachingActivity.count({ where }),
      this.prisma.teachingActivity.findMany({
        where,
        orderBy: [{ usesCount: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    // Fallback seed if DB is completely empty and requesting public
    if (total === 0 && (!scope || scope === 'ALL' || scope === 'SYSTEM') && !keyword) {
      return {
        items: DEFAULT_STARTER_ACTIVITIES.map((a) => this.mapLibraryActivity(a, teacherId)),
        total: DEFAULT_STARTER_ACTIVITIES.length,
        page: 1,
        limit,
        totalPages: 1,
      };
    }

    return {
      items: activities.map((a) => this.mapLibraryActivity(a, teacherId)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string, teacherId?: string) {
    // Check seed fallback
    const seed = DEFAULT_STARTER_ACTIVITIES.find((s) => s.id === id);
    if (seed) {
      return this.mapLibraryActivity(seed, teacherId);
    }

    const activity = await this.prisma.teachingActivity.findUnique({
      where: { id },
      include: { teacher: true, subject: true, grade: true },
    });

    if (!activity || activity.deletedAt) {
      throw new NotFoundException(`Không tìm thấy hoạt động ${id}`);
    }

    return this.mapLibraryActivity(activity, teacherId);
  }

  async create(dto: CreateLibraryActivityDto, teacherId?: string) {
    const activity = await this.prisma.teachingActivity.create({
      data: {
        teacherId,
        title: dto.title.trim(),
        subjectName: dto.subject || 'Toán',
        gradeName: dto.grade || 'Lớp 4',
        typeName: dto.type || 'Trò chơi',
        durationMinutes: dto.durationMinutes || 10,
        objective: dto.objective || null,
        method: dto.method || null,
        technique: dto.technique || null,
        competencies: dto.competencies || null,
        qualities: dto.qualities || null,
        equipment: dto.equipment || null,
        teacherActivity: dto.teacherActivity || null,
        studentActivity: dto.studentActivity || null,
        gameRules: dto.gameRules || null,
        questionsJson: dto.questionsJson || null,
        description: dto.description || null,
        icon: dto.icon || 'Grid2X2',
        isPublic: dto.isPublic !== undefined ? dto.isPublic : true,
        isSystem: false,
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'ACTIVITY_CREATE',
      resourceType: 'TeachingActivity',
      resourceId: activity.id,
      details: { title: activity.title, type: activity.typeName },
    });

    return this.mapLibraryActivity(activity, teacherId);
  }

  async update(id: string, dto: UpdateLibraryActivityDto, teacherId?: string) {
    const existing = await this.prisma.teachingActivity.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy hoạt động ${id}`);
    }

    if (existing.isSystem || !existing.teacherId || existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa hoạt động này');
    }

    const updated = await this.prisma.teachingActivity.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        subjectName: dto.subject,
        gradeName: dto.grade,
        typeName: dto.type,
        durationMinutes: dto.durationMinutes,
        objective: dto.objective,
        method: dto.method,
        technique: dto.technique,
        competencies: dto.competencies,
        qualities: dto.qualities,
        equipment: dto.equipment,
        teacherActivity: dto.teacherActivity,
        studentActivity: dto.studentActivity,
        gameRules: dto.gameRules,
        questionsJson: dto.questionsJson,
        description: dto.description,
        icon: dto.icon,
        isPublic: dto.isPublic,
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'ACTIVITY_UPDATE',
      resourceType: 'TeachingActivity',
      resourceId: id,
    });

    return this.mapLibraryActivity(updated, teacherId);
  }

  async remove(id: string, teacherId?: string) {
    const existing = await this.prisma.teachingActivity.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Không tìm thấy hoạt động ${id}`);
    }

    if (existing.isSystem || !existing.teacherId || existing.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền xóa hoạt động này');
    }

    await this.prisma.teachingActivity.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'ACTIVITY_DELETE',
      resourceType: 'TeachingActivity',
      resourceId: id,
    });

    return { success: true, message: 'Đã xóa hoạt động khỏi thư viện' };
  }

  async duplicate(id: string, teacherId?: string) {
    const source = await this.findOne(id, teacherId);

    const duplicate = await this.prisma.teachingActivity.create({
      data: {
        teacherId,
        title: `${source.title} (Bản sao)`,
        subjectName: source.subject,
        gradeName: source.grade,
        typeName: source.type,
        durationMinutes: source.durationMinutes,
        objective: source.objective,
        method: source.method,
        technique: source.technique,
        competencies: source.competencies,
        qualities: source.qualities,
        equipment: source.equipment,
        teacherActivity: source.teacherActivity,
        studentActivity: source.studentActivity,
        gameRules: source.gameRules,
        questionsJson: source.questionsJson,
        description: source.description,
        icon: source.icon,
        isPublic: false,
        isSystem: false,
        usesCount: 0,
      },
    });

    this.auditService?.log({
      actorUserId: teacherId,
      action: 'ACTIVITY_DUPLICATE',
      resourceType: 'TeachingActivity',
      resourceId: duplicate.id,
      details: { sourceId: id, newTitle: duplicate.title },
    });

    return this.mapLibraryActivity(duplicate, teacherId);
  }

  async addToLessonPlan(activityId: string, lessonPlanId: string, teacherId: string) {
    const libraryActivity = await this.findOne(activityId, teacherId);

    const lessonPlan = await this.prisma.lessonPlan.findUnique({
      where: { id: lessonPlanId },
      include: { teachingAssignment: true },
    });

    if (!lessonPlan || lessonPlan.deletedAt) {
      throw new NotFoundException('Không tìm thấy giáo án mục tiêu');
    }

    const planTeacherId = lessonPlan.teachingAssignment?.teacherId || lessonPlan.teacherId;
    if (planTeacherId !== teacherId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa giáo án này');
    }

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.lessonPlanActivity.count({
        where: { lessonPlanId },
      });

      // Completely decoupled snapshot copy
      const newActivity = await tx.lessonPlanActivity.create({
        data: {
          lessonPlanId,
          phase: libraryActivity.type || 'Khởi động',
          title: libraryActivity.title,
          durationMinutes: libraryActivity.durationMinutes || 10,
          method: libraryActivity.method || '',
          technique: libraryActivity.technique || '',
          competencies: libraryActivity.competencies || '',
          qualities: libraryActivity.qualities || '',
          equipment: libraryActivity.equipment || null,
          objective: libraryActivity.objective || libraryActivity.description || '',
          teacherActivity: libraryActivity.teacherActivity || `GV tổ chức hoạt động ${libraryActivity.title}.`,
          studentActivity: libraryActivity.studentActivity || `HS tham gia hoạt động ${libraryActivity.title}.`,
          sortOrder: count,
        },
      });

      // Increment usesCount if real DB activity
      if (!activityId.startsWith('seed-')) {
        await tx.teachingActivity.updateMany({
          where: { id: activityId },
          data: { usesCount: { increment: 1 } },
        });
      }

      this.auditService?.log({
        actorUserId: teacherId,
        action: 'ACTIVITY_COPY_TO_LESSON_PLAN',
        resourceType: 'LessonPlanActivity',
        resourceId: newActivity.id,
        details: { libraryActivityId: activityId, lessonPlanId },
      });

      return {
        id: newActivity.id,
        phase: newActivity.phase,
        title: newActivity.title,
        minutes: newActivity.durationMinutes,
        method: newActivity.method || '',
        technique: newActivity.technique || '',
        competencies: newActivity.competencies || '',
        qualities: newActivity.qualities || '',
        equipment: newActivity.equipment || '',
        objective: newActivity.objective || '',
        teacher: newActivity.teacherActivity || '',
        students: newActivity.studentActivity || '',
        sortOrder: newActivity.sortOrder,
      };
    });
  }

  private mapLibraryActivity(a: any, currentTeacherId?: string) {
    const isOwner = a.teacherId && currentTeacherId ? a.teacherId === currentTeacherId : false;
    return {
      id: a.id,
      teacherId: a.teacherId || null,
      isOwner,
      isSystem: a.isSystem || !a.teacherId,
      title: a.title,
      subject: a.subjectName || a.subject?.name || 'Toán',
      grade: a.gradeName || a.grade?.name || 'Lớp 4',
      type: a.typeName || 'Trò chơi',
      durationMinutes: a.durationMinutes || 10,
      objective: a.objective || '',
      method: a.method || '',
      technique: a.technique || '',
      competencies: a.competencies || '',
      qualities: a.qualities || '',
      equipment: a.equipment || '',
      teacherActivity: a.teacherActivity || '',
      studentActivity: a.studentActivity || '',
      gameRules: a.gameRules || '',
      questionsJson: a.questionsJson || null,
      description: a.description || '',
      uses: a.usesCount || 0,
      icon: a.icon || 'Grid2X2',
      isPublic: a.isPublic !== undefined ? a.isPublic : true,
      updatedAt: a.updatedAt || a.createdAt,
      createdAt: a.createdAt,
    };
  }
}
