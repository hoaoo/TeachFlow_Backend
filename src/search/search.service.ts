import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';

export interface SearchResult {
  students: Array<{
    id: string;
    fullName: string;
    studentCode: string | null;
    classroomName: string | null;
    gradeName: string | null;
    avatarColor: string | null;
    status: string;
    type: 'STUDENT';
  }>;
  lessonPlans: Array<{
    id: string;
    title: string;
    topic: string | null;
    subjectName: string | null;
    gradeName: string | null;
    status: string;
    type: 'LESSON_PLAN';
  }>;
  worksheets: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    status: string;
    type: 'WORKSHEET';
  }>;
  resources: Array<{
    id: string;
    name: string;
    originalFileName: string | null;
    resourceType: string;
    extension?: string;
    formattedSize?: string;
    size?: number | null;
    type: 'RESOURCE';
  }>;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  private formatFileSize(bytes?: number | null): string {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async globalSearch(
    userId: string,
    providedTeacherId: string | undefined,
    query: SearchQueryDto,
  ): Promise<SearchResult> {
    const rawKeyword = query.q ? query.q.trim() : '';
    const limit = Math.min(Math.max(1, query.limit || 5), 20);

    const emptyResult: SearchResult = {
      students: [],
      lessonPlans: [],
      worksheets: [],
      resources: [],
    };

    if (!rawKeyword || rawKeyword.length < 2) {
      return emptyResult;
    }

    let teacherId = providedTeacherId;
    if (!teacherId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId },
        select: { id: true },
      });
      teacherId = teacher?.id;
    }

    if (!teacherId) {
      return emptyResult;
    }

    const keyword = rawKeyword;

    try {
      const [students, lessonPlans, worksheets, resources] = await Promise.all([
        // 1. Search Students scoped by Teacher's Classrooms
        this.prisma.student.findMany({
          where: {
            deletedAt: null,
            OR: [
              { fullName: { contains: keyword, mode: 'insensitive' } },
              { studentCode: { contains: keyword, mode: 'insensitive' } },
              { parentPhone: { contains: keyword, mode: 'insensitive' } },
            ],
            studentEnrollments: {
              some: {
                classroom: {
                  OR: [
                    { teacherId },
                    { homeroomTeacherId: teacherId },
                  ],
                },
              },
            },
          },
          take: limit,
          select: {
            id: true,
            fullName: true,
            studentCode: true,
            avatarColor: true,
            status: true,
            studentEnrollments: {
              where: {
                classroom: {
                  OR: [
                    { teacherId },
                    { homeroomTeacherId: teacherId },
                  ],
                },
              },
              select: {
                classroom: {
                  select: {
                    name: true,
                    grade: { select: { name: true } },
                  },
                },
              },
              take: 1,
            },
          },
          orderBy: { fullName: 'asc' },
        }),

        // 2. Search Lesson Plans scoped by Teacher
        this.prisma.lessonPlan.findMany({
          where: {
            teacherId,
            deletedAt: null,
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { topic: { contains: keyword, mode: 'insensitive' } },
              { subjectName: { contains: keyword, mode: 'insensitive' } },
              { gradeName: { contains: keyword, mode: 'insensitive' } },
            ],
          },
          take: limit,
          select: {
            id: true,
            title: true,
            topic: true,
            subjectName: true,
            gradeName: true,
            status: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),

        // 3. Search Worksheets scoped by Teacher
        this.prisma.worksheet.findMany({
          where: {
            teacherId,
            deletedAt: null,
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { subtitle: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } },
            ],
          },
          take: limit,
          select: {
            id: true,
            title: true,
            subtitle: true,
            description: true,
            status: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),

        // 4. Search Teaching Resources scoped by Teacher
        this.prisma.teachingResource.findMany({
          where: {
            teacherId,
            deletedAt: null,
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { originalFileName: { contains: keyword, mode: 'insensitive' } },
              { title: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } },
            ],
          },
          take: limit,
          select: {
            id: true,
            name: true,
            originalFileName: true,
            resourceType: true,
            size: true,
            storedFileName: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);

      return {
        students: students.map((s) => {
          const enrollment = s.studentEnrollments?.[0];
          return {
            id: s.id,
            fullName: s.fullName,
            studentCode: s.studentCode,
            classroomName: enrollment?.classroom?.name || null,
            gradeName: enrollment?.classroom?.grade?.name || null,
            avatarColor: s.avatarColor,
            status: s.status,
            type: 'STUDENT',
          };
        }),
        lessonPlans: lessonPlans.map((lp) => ({
          id: lp.id,
          title: lp.title,
          topic: lp.topic,
          subjectName: lp.subjectName,
          gradeName: lp.gradeName,
          status: lp.status,
          type: 'LESSON_PLAN',
        })),
        worksheets: worksheets.map((w) => ({
          id: w.id,
          title: w.title,
          subtitle: w.subtitle,
          description: w.description,
          status: w.status,
          type: 'WORKSHEET',
        })),
        resources: resources.map((r) => {
          const ext = (r.originalFileName || r.storedFileName || '').split('.').pop()?.toUpperCase() || '';
          return {
            id: r.id,
            name: r.name,
            originalFileName: r.originalFileName,
            resourceType: r.resourceType,
            extension: ext,
            formattedSize: this.formatFileSize(r.size),
            size: r.size,
            type: 'RESOURCE',
          };
        }),
      };
    } catch (err: any) {
      this.logger.error(`Error during global search: ${err?.message}`, err?.stack);
      return emptyResult;
    }
  }
}
