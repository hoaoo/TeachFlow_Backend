import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import archiver = require('archiver');
import { PassThrough } from 'stream';
import { ExportBackupDto } from './dto/export-backup.dto';

@Injectable()
export class TeacherBackupService {
  private readonly logger = new Logger(TeacherBackupService.name);

  constructor(private readonly prisma: PrismaService) {}

  private createExcelBuffer(sheetName: string, headers: string[], rows: any[][]): Buffer {
    const wb = XLSX.utils.book_new();
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Auto-fit column widths
    const colWidths = headers.map((h, i) => {
      let maxLen = h.length;
      for (const row of rows) {
        const valStr = String(row[i] ?? '');
        if (valStr.length > maxLen) {
          maxLen = valStr.length;
        }
      }
      return { wch: Math.min(Math.max(maxLen + 3, 10), 60) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  async generateBackupZip(
    userId: string,
    providedTeacherId: string | undefined,
    dto: ExportBackupDto,
  ): Promise<{ stream: PassThrough; filename: string; contentType: string }> {
    let teacherId = providedTeacherId;
    if (!teacherId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId },
        select: { id: true, fullName: true },
      });
      teacherId = teacher?.id;
    }

    if (!teacherId) {
      throw new NotFoundException('Không tìm thấy thông tin giáo viên để xuất dữ liệu.');
    }

    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { fullName: true },
    });

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    const archive = (archiver as any)('zip', { zlib: { level: 6 } });
    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    // 1. Export Students
    if (dto.includeStudents !== false) {
      const studentWhere: any = {
        deletedAt: null,
        studentEnrollments: {
          some: {
            classroom: {
              OR: [{ teacherId }, { homeroomTeacherId: teacherId }],
              ...(dto.schoolYearId ? { schoolYearId: dto.schoolYearId } : {}),
            },
          },
        },
      };

      const students = await this.prisma.student.findMany({
        where: studentWhere,
        include: {
          studentEnrollments: {
            where: {
              classroom: {
                OR: [{ teacherId }, { homeroomTeacherId: teacherId }],
                ...(dto.schoolYearId ? { schoolYearId: dto.schoolYearId } : {}),
              },
            },
            include: {
              classroom: {
                select: { name: true, grade: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { fullName: 'asc' },
      });

      const studentHeaders = [
        'STT',
        'Mã Học Sinh',
        'Họ và Tên',
        'Ngày Sinh',
        'Giới Tính',
        'Lớp',
        'Khối',
        'Tên Phụ Huynh',
        'SĐT Phụ Huynh',
        'Email Phụ Huynh',
        'Trạng Thái',
      ];

      const studentRows = students.map((s, idx) => {
        const cls = s.studentEnrollments?.[0]?.classroom;
        return [
          idx + 1,
          s.studentCode || '',
          s.fullName,
          s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('vi-VN') : s.dobString || '',
          s.gender === 'FEMALE' ? 'Nữ' : 'Nam',
          cls?.name || '',
          cls?.grade?.name || '',
          s.parentName || '',
          s.parentPhone || '',
          s.parentEmail || '',
          s.status || 'EXCELLENT',
        ];
      });

      const buf = this.createExcelBuffer('HocSinh', studentHeaders, studentRows);
      archive.append(buf, { name: 'students.xlsx' });
    }

    // 2. Export Attendance
    if (dto.includeAttendance !== false) {
      const attendanceSessions = await this.prisma.attendanceSession.findMany({
        where: {
          teacherId,
          ...(dto.schoolYearId ? { classroom: { schoolYearId: dto.schoolYearId } } : {}),
        },
        include: {
          classroom: { select: { name: true } },
          attendances: {
            include: {
              student: { select: { fullName: true, studentCode: true } },
            },
          },
        },
        orderBy: { attendanceDate: 'desc' },
      });

      const attHeaders = [
        'STT',
        'Ngày Điểm Danh',
        'Lớp',
        'Buổi/Tiết',
        'Mã HS',
        'Họ và Tên Học Sinh',
        'Trạng Thái',
        'Phút Trễ',
        'Ghi Chú',
      ];

      const attRows: any[][] = [];
      let counter = 1;
      for (const session of attendanceSessions) {
        const dateStr = new Date(session.attendanceDate).toLocaleDateString('vi-VN');
        for (const att of session.attendances) {
          const statusText =
            att.status === 'PRESENT'
              ? 'Có mặt'
              : att.status === 'LATE'
              ? 'Đi trễ'
              : att.status === 'EXCUSED_ABSENCE'
              ? 'Nghỉ có phép'
              : 'Nghỉ không phép';

          attRows.push([
            counter++,
            dateStr,
            session.classroom?.name || '',
            session.sessionPeriod === 'MORNING' ? 'Buổi sáng' : 'Buổi chiều',
            att.student?.studentCode || '',
            att.student?.fullName || '',
            statusText,
            att.lateMinutes || 0,
            att.note || '',
          ]);
        }
      }

      const buf = this.createExcelBuffer('DiemDanh', attHeaders, attRows);
      archive.append(buf, { name: 'attendance.xlsx' });
    }

    // 3. Export Assessments
    if (dto.includeAssessments !== false) {
      const assessments = await this.prisma.assessment.findMany({
        where: {
          teacherId,
          deletedAt: null,
          ...(dto.schoolYearId ? { classroom: { schoolYearId: dto.schoolYearId } } : {}),
        },
        include: {
          classroom: { select: { name: true } },
          subject: { select: { name: true } },
          studentAssessments: {
            include: {
              student: { select: { fullName: true, studentCode: true } },
            },
          },
        },
        orderBy: { assessmentDate: 'desc' },
      });

      const assessHeaders = [
        'STT',
        'Ngày Đánh Giá',
        'Tên Bài Đánh Giá',
        'Lớp',
        'Môn Học',
        'Mã HS',
        'Họ và Tên Học Sinh',
        'Mức Đạt',
        'Điểm Số',
        'Nhận Xét Của Giáo Viên',
      ];

      const assessRows: any[][] = [];
      let counter = 1;
      for (const a of assessments) {
        const dateStr = new Date(a.assessmentDate).toLocaleDateString('vi-VN');
        for (const sa of a.studentAssessments) {
          const levelText =
            sa.level === 'EXCELLENT'
              ? 'Hoàn thành tốt (T)'
              : sa.level === 'COMPLETED'
              ? 'Hoàn thành (H)'
              : 'Cần cố gắng (C)';

          assessRows.push([
            counter++,
            dateStr,
            a.title,
            a.classroom?.name || '',
            a.subject?.name || '',
            sa.student?.studentCode || '',
            sa.student?.fullName || '',
            levelText,
            sa.score !== null ? sa.score : '',
            sa.comment || '',
          ]);
        }
      }

      const buf = this.createExcelBuffer('DanhGia', assessHeaders, assessRows);
      archive.append(buf, { name: 'assessments.xlsx' });
    }

    // 4. Export Student Comments
    if (dto.includeComments !== false) {
      const comments = await this.prisma.studentComment.findMany({
        where: {
          teacherId,
          ...(dto.schoolYearId ? { classroom: { schoolYearId: dto.schoolYearId } } : {}),
        },
        include: {
          classroom: { select: { name: true } },
          subject: { select: { name: true } },
          student: { select: { fullName: true, studentCode: true } },
        },
        orderBy: { commentDate: 'desc' },
      });

      const commHeaders = [
        'STT',
        'Ngày Nhận Xét',
        'Lớp',
        'Môn Học',
        'Mã HS',
        'Họ và Tên Học Sinh',
        'Nội Dung Nhận Xét',
      ];

      const commRows = comments.map((c, idx) => [
        idx + 1,
        new Date(c.commentDate).toLocaleDateString('vi-VN'),
        c.classroom?.name || '',
        c.subject?.name || 'Chủ nhiệm / Chung',
        c.student?.studentCode || '',
        c.student?.fullName || '',
        c.content,
      ]);

      const buf = this.createExcelBuffer('NhanXet', commHeaders, commRows);
      archive.append(buf, { name: 'comments.xlsx' });
    }

    // 5. Export Lesson Plans
    if (dto.includeLessonPlans !== false) {
      const plans = await this.prisma.lessonPlan.findMany({
        where: {
          teacherId,
          deletedAt: null,
          ...(dto.schoolYearId ? { classroom: { schoolYearId: dto.schoolYearId } } : {}),
        },
        include: {
          classroom: { select: { name: true } },
          subject: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const planHeaders = [
        'STT',
        'Tên Giáo Án',
        'Chủ Đề / Bài Học',
        'Môn Học',
        'Lớp',
        'Tuần',
        'Tiết',
        'Thời Lượng (Phút)',
        'Mục Tiêu',
        'Trạng Thái',
        'Ngày Cập Nhật',
      ];

      const planRows = plans.map((p, idx) => [
        idx + 1,
        p.title,
        p.topic || '',
        p.subject?.name || p.subjectName || '',
        p.classroom?.name || p.gradeName || '',
        p.weekNumber || 1,
        p.periodNumber || 1,
        p.durationMinutes || 40,
        p.objectives || '',
        p.status || 'DRAFT',
        new Date(p.updatedAt).toLocaleDateString('vi-VN'),
      ]);

      const buf = this.createExcelBuffer('GiaoAn', planHeaders, planRows);
      archive.append(buf, { name: 'lesson-plans.xlsx' });
    }

    // 6. Export Worksheets
    if (dto.includeWorksheets !== false) {
      const worksheets = await this.prisma.worksheet.findMany({
        where: {
          teacherId,
          deletedAt: null,
          ...(dto.schoolYearId ? { classroom: { schoolYearId: dto.schoolYearId } } : {}),
        },
        include: {
          subject: { select: { name: true } },
          grade: { select: { name: true } },
          _count: { select: { questions: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const wsHeaders = [
        'STT',
        'Tiêu Đề Phiếu',
        'Phụ Đề',
        'Môn Học',
        'Khối',
        'Số Câu Hỏi',
        'Mô Tả',
        'Trạng Thái',
        'Ngày Tạo',
      ];

      const wsRows = worksheets.map((w, idx) => [
        idx + 1,
        w.title,
        w.subtitle || '',
        w.subject?.name || '',
        w.grade?.name || '',
        w._count?.questions || 0,
        w.description || '',
        w.status || 'DRAFT',
        new Date(w.createdAt).toLocaleDateString('vi-VN'),
      ]);

      const buf = this.createExcelBuffer('PhieuHocTap', wsHeaders, wsRows);
      archive.append(buf, { name: 'worksheets.xlsx' });
    }

    // 7. Export Teaching Resources Metadata
    if (dto.includeResources !== false) {
      const resources = await this.prisma.teachingResource.findMany({
        where: {
          teacherId,
          deletedAt: null,
        },
        include: {
          subject: { select: { name: true } },
          grade: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const resHeaders = [
        'STT',
        'Tên Tài Nguyên',
        'Tên Tệp Gốc',
        'Loại Học Liệu',
        'Dung Lượng (Bytes)',
        'Môn Học',
        'Khối Lớp',
        'Mô Tả',
        'Ngày Tải Lên',
      ];

      const resRows = resources.map((r, idx) => [
        idx + 1,
        r.name,
        r.originalFileName || '',
        r.resourceType,
        r.size || 0,
        r.subject?.name || '',
        r.grade?.name || '',
        r.description || '',
        new Date(r.createdAt).toLocaleDateString('vi-VN'),
      ]);

      const buf = this.createExcelBuffer('TaiNguyen', resHeaders, resRows);
      archive.append(buf, { name: 'resources.xlsx' });
    }

    // Finalize archive
    archive.finalize();

    this.logger.log(`[TEACHER_BACKUP_GENERATED] teacher="${teacher?.fullName}" date=${dateStr}`);

    return {
      stream: passThrough,
      filename: `teachflow-backup-${dateStr}.zip`,
      contentType: 'application/zip',
    };
  }
}
