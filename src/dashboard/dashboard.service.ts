import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(teacherId?: string) {
    // 1. Get lessons / teaching plans for today
    const teachingPlans = await this.prisma.teachingPlan.findMany({
      where: teacherId ? { teacherId } : {},
      include: {
        classroom: true,
        subject: true,
        lesson: true,
      },
      take: 5,
    });

    const lessons = teachingPlans.length > 0
      ? teachingPlans.map((tp, i) => ({
          time: i === 0 ? '07:30' : i === 1 ? '09:15' : '14:00',
          subject: tp.subject?.name || 'Toán',
          title: tp.title || tp.lesson?.title || 'Phân số bằng nhau',
          className: tp.classroom?.name || '4A',
          room: tp.room || tp.classroom?.room || 'Phòng 204',
          color: tp.tone || (i === 0 ? 'teal' : i === 1 ? 'orange' : 'blue'),
        }))
      : [
          { time: '07:30', subject: 'Toán', title: 'Phân số bằng nhau', className: '4A', room: 'Phòng 204', color: 'teal' },
          { time: '09:15', subject: 'Tiếng Việt', title: 'Luyện tập miêu tả cây cối', className: '4A', room: 'Phòng 204', color: 'orange' },
          { time: '14:00', subject: 'Khoa học', title: 'Âm thanh trong cuộc sống', className: '4B', room: 'Phòng 101', color: 'blue' },
        ];

    // 2. Get tasks
    const dbTasks = await this.prisma.teacherTask.findMany({
      where: teacherId ? { teacherId } : {},
      orderBy: { createdAt: 'asc' },
    });

    const tasks = dbTasks.length > 0
      ? dbTasks.map((t) => ({
          id: t.id,
          title: t.title,
          due: t.dueDate || 'Hôm nay',
          done: t.done,
        }))
      : [
          { id: 'task-1', title: 'Hoàn thiện giáo án Toán - Tuần 3', due: 'Hôm nay', done: true },
          { id: 'task-2', title: 'Nhận xét học sinh tháng 8', due: 'Còn 2 ngày', done: false },
          { id: 'task-3', title: 'Chuẩn bị phiếu học tập Tiếng Việt', due: 'Thứ Sáu', done: false },
          { id: 'task-4', title: 'Cập nhật sổ chủ nhiệm', due: 'Thứ Sáu', done: false },
        ];

    // 3. Featured students
    const students = [
      { id: 'ma', name: 'Minh Anh', initials: 'MA', progress: 92, status: 'Tốt', color: 'bg-teal-100 text-teal-700' },
      { id: 'gh', name: 'Gia Huy', initials: 'GH', progress: 86, status: 'Tốt', color: 'bg-blue-100 text-blue-700' },
      { id: 'kl', name: 'Khánh Linh', initials: 'KL', progress: 78, status: 'Khá', color: 'bg-orange-100 text-orange-700' },
      { id: 'dm', name: 'Đức Minh', initials: 'ĐM', progress: 70, status: 'Cần cố gắng', color: 'bg-rose-100 text-rose-700' },
    ];

    // 4. Counts
    const lessonPlansCount = await this.prisma.lessonPlan.count({
      where: {
        status: 'COMPLETED',
        deletedAt: null,
        ...(teacherId ? { teacherId } : {}),
      },
    });

    const completedTasksCount = tasks.filter((t) => t.done).length;

    return {
      greeting: {
        date: 'Thứ Tư, 20 tháng 8, 2026',
        title: 'Chào buổi sáng, cô Hà',
        description: 'Mọi thứ đang diễn ra thật tốt. Đây là tổng quan công việc hôm nay.',
      },
      stats: [
        { label: 'Tiết dạy hôm nay', value: '3', note: '2 tiết còn lại', tone: 'teal', icon: 'CalendarDays' },
        { label: 'Giáo án hoàn thành', value: String(lessonPlansCount || 12), note: '+3 so với tuần trước', tone: 'blue', icon: 'BookOpen' },
        { label: 'Học sinh cần chú ý', value: '4', note: 'Trong 2 lớp', tone: 'orange', icon: 'GraduationCap' },
        { label: 'Nhiệm vụ tuần này', value: `${completedTasksCount}/${tasks.length}`, note: `${Math.round((completedTasksCount / (tasks.length || 1)) * 100)}% hoàn thành`, tone: 'purple', icon: 'CheckCircle2' },
      ],
      lessons,
      tasks,
      classProgress: {
        className: 'Lớp 4A',
        overallPercent: 78,
        excellent: 18,
        improving: 10,
        needsSupport: 4,
      },
      featuredStudents: students,
    };
  }
}
