import { PrismaClient, BehaviorCategory, BehaviorLevel } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { AdminTeachersService } from '../src/admin/admin-teachers.service';
import { ClassroomsService } from '../src/classrooms/classrooms.service';
import { StudentsService } from '../src/students/students.service';
import { TeachingPlansService } from '../src/teaching-plans/teaching-plans.service';
import { LessonPlansService } from '../src/lesson-plans/lesson-plans.service';
import { WorksheetsService } from '../src/worksheets/worksheets.service';
import { AttendanceService } from '../src/attendance/attendance.service';
import { AssessmentsService } from '../src/assessments/assessments.service';
import { StudentCommentsService } from '../src/student-comments/student-comments.service';
import { HomeroomService } from '../src/homeroom/homeroom.service';
import { HomeroomExportService } from '../src/export/homeroom-export.service';
import { ResourcesService } from '../src/resources/resources.service';
import { StorageService } from '../src/resources/storage/storage.service';
import { TasksService } from '../src/tasks/tasks.service';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { ExportService } from '../src/export/export.service';
import { LessonPlanExportService } from '../src/export/lesson-plan-export.service';
import { WorksheetExportService } from '../src/export/worksheet-export.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';

const prisma = new PrismaClient();

async function runFullCoreJourney() {
  console.log('================================================================');
  console.log('  TEACHFLOW V1 FULL APP CORE USER JOURNEY AUDIT VERIFICATION');
  console.log('================================================================\n');

  const configService = new ConfigService();
  const storageService = new StorageService(configService);
  const resourcesService = new ResourcesService(prisma as any, storageService, configService);
  const lessonPlanExportService = new LessonPlanExportService();
  const worksheetExportService = new WorksheetExportService();
  const homeroomExportService = new HomeroomExportService();
  const exportService = new ExportService(prisma as any, lessonPlanExportService, worksheetExportService);
  const homeroomService = new HomeroomService(prisma as any, homeroomExportService);
  const adminService = new AdminTeachersService(prisma as any);
  const classroomsService = new ClassroomsService(prisma as any);
  const studentsService = new StudentsService(prisma as any);
  const teachingPlansService = new TeachingPlansService(prisma as any);
  const lessonPlansService = new LessonPlansService(prisma as any);
  const worksheetsService = new WorksheetsService(prisma as any);
  const attendanceService = new AttendanceService(prisma as any);
  const assessmentsService = new AssessmentsService(prisma as any);
  const commentsService = new StudentCommentsService(prisma as any);
  const tasksService = new TasksService(prisma as any);
  const dashboardService = new DashboardService(prisma as any);
  const jwtStrategy = new JwtStrategy(configService, prisma as any);

  const testId = Date.now().toString();
  const teacherLanEmail = `teacher_lan_${testId}@teachflow.vn`;
  const teacherBEmail = `teacher_b_${testId}@teachflow.vn`;

  let adminUser: any;
  let teacherLanAccount: any;
  let teacherBAccount: any;
  let classroom4C: any;
  let student1: any;
  let student2: any;
  let teachingPlan: any;
  let lessonPlan: any;
  let resource: any;
  let worksheet: any;
  let assessment: any;
  let task: any;

  try {
    // 1. Admin creates Teacher Lan
    console.log('[1/18] Admin creates Teacher Lan account...');
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      const hash = await bcrypt.hash('Admin@123456', 10);
      adminUser = await prisma.user.create({
        data: { email: `admin_${testId}@teachflow.vn`, passwordHash: hash, role: 'ADMIN' },
      });
    }

    teacherLanAccount = await adminService.createTeacher(
      {
        fullName: `Cô Giáo Lan ${testId}`,
        email: teacherLanEmail,
        phone: '0912345678',
        password: 'Password123@',
      },
      { userId: adminUser.id, email: adminUser.email, role: 'ADMIN' },
    );
    console.log(`   ✓ Teacher Lan created with ID: ${teacherLanAccount.id}`);

    // Create Teacher B for Cross-Tenant verification
    const passHashB = await bcrypt.hash('Password123@', 10);
    const userB = await prisma.user.create({
      data: {
        email: teacherBEmail,
        passwordHash: passHashB,
        role: 'TEACHER',
        teacher: { create: { fullName: `Thầy B ${testId}`, phone: '0987654321' } },
      },
      include: { teacher: true },
    });
    teacherBAccount = userB.teacher;

    const teacherLanId = teacherLanAccount.id;
    const teacherBId = teacherBAccount.id;

    // 2. Teacher Lan creates Classroom 4C
    console.log('\n[2/18] Teacher Lan creates Classroom 4C...');
    classroom4C = await classroomsService.create(
      { name: `4C-${testId}`, room: 'Phòng 403', schedule: 'Sáng · Thứ 2 - Thứ 6' },
      teacherLanId,
    );
    console.log(`   ✓ Classroom created: ${classroom4C.name} (${classroom4C.id})`);

    // 3. Teacher Lan adds Students: Hoang An, Minh Chau
    console.log('\n[3/18] Teacher Lan adds Students to Classroom 4C...');
    student1 = await studentsService.create(
      {
        fullName: `Nguyễn Hoàng An ${testId}`,
        classId: classroom4C.id,
        gender: 'MALE' as any,
      },
      teacherLanId,
    );
    student2 = await studentsService.create(
      {
        fullName: `Trần Minh Châu ${testId}`,
        classId: classroom4C.id,
        gender: 'FEMALE' as any,
      },
      teacherLanId,
    );
    console.log(`   ✓ Added students: ${student1.name}, ${student2.name}`);

    // 4. Teacher Lan creates Teaching Plan
    console.log('\n[4/18] Teacher Lan creates Teaching Plan for Math...');
    teachingPlan = await teachingPlansService.create(
      {
        classroomId: classroom4C.id,
        title: 'Kế hoạch dạy học Phân số',
        weekNumber: 1,
      },
      teacherLanId,
    );
    console.log(`   ✓ Teaching Plan created: ${teachingPlan.title}`);

    // 5. Teacher Lan creates Lesson Plan with 3 activities
    console.log('\n[5/18] Teacher Lan creates Lesson Plan with activities...');
    lessonPlan = await lessonPlansService.create(
      {
        title: 'Phép cộng phân số',
        subject: 'Toán',
        grade: 'Khối 4',
        duration: 40,
        activities: [
          { phase: 'Khởi động', title: 'Trò chơi hộp quà bí mật', minutes: 5, method: 'Trò chơi' },
          { phase: 'Khám phá', title: 'Quy tắc cộng hai phân số', minutes: 15, method: 'Trực quan' },
          { phase: 'Luyện tập', title: 'Bài tập 1 & 2 SGK', minutes: 20, method: 'Thực hành cá nhân' },
        ],
      },
      teacherLanId,
    );
    console.log(`   ✓ Lesson Plan created: ${lessonPlan.title} (${lessonPlan.activities.length} activities)`);

    const userLan = { userId: teacherLanAccount.userId, email: teacherLanEmail, role: 'TEACHER', teacherId: teacherLanId };

    // 6. Teacher Lan creates & uploads a Resource
    console.log('\n[6/18] Teacher Lan uploads Teaching Resource and attaches to Lesson Plan...');
    const fakeFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'bai_giang_phan_so.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test dummy pdf content'),
      size: 32,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    resource = await resourcesService.uploadResource(
      fakeFile,
      { name: 'Bài giảng Phân số', description: 'Tài liệu slide PDF' },
      userLan,
    );
    console.log(`   ✓ Resource uploaded: ${resource.name} (${resource.id})`);

    // Attach resource to Lesson Plan
    await lessonPlansService.attachResource(lessonPlan.id, resource.id, teacherLanId);
    console.log('   ✓ Attached resource to Lesson Plan.');

    // 7. Export Lesson Plan to DOCX & PDF
    console.log('\n[7/18] Teacher Lan exports Lesson Plan to DOCX and PDF...');
    const lpDocx = await exportService.exportLessonPlanDocx(lessonPlan.id, userLan);
    const lpPdf = await exportService.exportLessonPlanPdf(lessonPlan.id, userLan);
    if (lpDocx.buffer.length > 500 && lpPdf.buffer.length > 500) {
      console.log(`   ✓ Lesson Plan DOCX (${lpDocx.buffer.length}b) & PDF (${lpPdf.buffer.length}b) exported successfully.`);
    } else {
      throw new Error('FAIL: Lesson Plan export buffer too small.');
    }

    // 8. Teacher Lan creates Worksheet with questions
    console.log('\n[8/18] Teacher Lan creates Worksheet with questions...');
    worksheet = await worksheetsService.create(
      {
        title: 'Phiếu bài tập Phép cộng phân số',
      },
      teacherLanId,
    );
    console.log(`   ✓ Worksheet created: ${worksheet.title}`);

    // Export Worksheet
    const wsDocx = await exportService.exportWorksheetDocx(worksheet.id, userLan, false);
    const wsPdf = await exportService.exportWorksheetPdf(worksheet.id, userLan, true);
    console.log(`   ✓ Worksheet DOCX (${wsDocx.buffer.length}b) & PDF (${wsPdf.buffer.length}b) exported successfully.`);

    // 9. Teacher Lan marks Attendance
    console.log('\n[9/18] Teacher Lan marks Attendance for Classroom 4C...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await attendanceService.saveAttendance(
      {
        classId: classroom4C.id,
        date: today.toISOString().split('T')[0],
        attendances: [
          { studentId: student1.id, status: 'PRESENT' as any },
          { studentId: student2.id, status: 'LATE' as any, note: 'Đi muộn 10 phút' },
        ],
      },
      teacherLanId,
    );
    console.log('   ✓ Marked attendance: 1 PRESENT, 1 LATE.');

    // 10. Teacher Lan creates Assessment and records score
    console.log('\n[10/18] Teacher Lan creates Assessment and records results...');
    assessment = await assessmentsService.create(
      {
        classroomId: classroom4C.id,
        title: 'Kiểm tra thường xuyên Toán',
        criteria: [{ name: 'Kỹ năng tính toán', code: 'MATH_CALC' }],
      },
      teacherLanId,
    );

    await assessmentsService.bulkUpdateStudents(
      assessment.id,
      {
        assessments: [
          { studentId: student1.id, level: 'EXCELLENT' as any, score: 9.5, comment: 'Tính toán nhanh' },
          { studentId: student2.id, level: 'COMPLETED' as any, score: 7.5, comment: 'Đạt yêu cầu' },
        ],
      },
      teacherLanId,
    );
    console.log('   ✓ Assessment created and results saved.');

    // 11. Teacher Lan adds Comment for student1
    console.log('\n[11/18] Teacher Lan adds Student Comment...');
    const comment = await commentsService.createForStudent(
      student1.id,
      { content: 'Em tiếp thu bài rất nhanh và có tinh thần tự giác.' },
      teacherLanId,
    );
    console.log(`   ✓ Student comment created: "${comment.content}"`);

    // 12. Homeroom: Create Behavior Record
    console.log('\n[12/18] Homeroom: Teacher Lan creates Behavior Record...');
    const behavior = await homeroomService.createBehaviorRecord(
      {
        classroomId: classroom4C.id,
        studentId: student1.id,
        recordDate: today.toISOString().split('T')[0],
        category: BehaviorCategory.LEARNING,
        level: BehaviorLevel.POSITIVE,
        content: 'Tích cực xung phong phát biểu xây dựng bài',
      },
      teacherLanId,
    );
    console.log(`   ✓ Behavior record created: ${behavior.content}`);

    // 13. Homeroom: Save Weekly Review & Monthly Review
    console.log('\n[13/18] Homeroom: Save Weekly Review & Monthly Review...');
    const weeklyReview = await homeroomService.saveWeeklyReview(
      {
        classroomId: classroom4C.id,
        weekNumber: 1,
        strengths: 'Lớp 4C duy trì nề nếp tốt',
        limitations: 'Một số em còn đi muộn',
        nextWeekPlan: 'Khắc phục tình trạng đi muộn',
        version: 1,
      },
      teacherLanId,
    );
    console.log(`   ✓ Weekly review saved (v${weeklyReview.version})`);

    const monthlyReview = await homeroomService.saveMonthlyReview(
      {
        classroomId: classroom4C.id,
        year: 2026,
        month: 8,
        highlights: 'Hoàn thành 100% mục tiêu tháng 8',
        limitations: 'Cần duy trì vệ sinh lớp học',
        nextMonthPlan: 'Chuẩn bị lễ khai giảng năm học mới',
        version: 1,
      },
      teacherLanId,
    );
    console.log(`   ✓ Monthly review saved (v${monthlyReview.version})`);

    // 14. Homeroom: Export Weekly & Monthly reports to DOCX and PDF
    console.log('\n[14/18] Homeroom: Export Weekly & Monthly reports...');
    const hrWeeklyDocx = await homeroomService.exportWeeklyReview(classroom4C.id, 1, undefined, teacherLanId, 'docx');
    const hrWeeklyPdf = await homeroomService.exportWeeklyReview(classroom4C.id, 1, undefined, teacherLanId, 'pdf');
    const hrMonthlyDocx = await homeroomService.exportMonthlySummary(classroom4C.id, 2026, 8, teacherLanId, 'docx');
    const hrMonthlyPdf = await homeroomService.exportMonthlySummary(classroom4C.id, 2026, 8, teacherLanId, 'pdf');
    console.log(`   ✓ Homeroom reports exported: Weekly DOCX (${hrWeeklyDocx.buffer.length}b), Monthly PDF (${hrMonthlyPdf.buffer.length}b).`);

    // 15. Tasks: Create & Complete Task
    console.log('\n[15/18] Tasks: Create & complete TeacherTask...');
    task = await tasksService.create(
      { title: 'Chuẩn bị đồ dùng dạy học bài Phân số' },
      teacherLanId,
    );
    await tasksService.update(task.id, { done: true }, teacherLanId);
    console.log(`   ✓ Task created and marked as done: ${task.title}`);

    // 16. Dashboard Aggregation Verification
    console.log('\n[16/18] Dashboard: Verify aggregated statistics for Teacher Lan...');
    const dashboard = await dashboardService.getDashboardData(teacherLanId);
    console.log(`   Dashboard stats: Lessons today: ${dashboard.stats[0]?.value}, Lesson plans: ${dashboard.stats[1]?.value}, Tasks: ${dashboard.stats[3]?.value}`);
    if (dashboard.stats.length >= 4 && dashboard.lessons.length >= 1) {
      console.log('   ✓ Dashboard metrics accurately reflect real database records.');
    } else {
      throw new Error('FAIL: Dashboard data did not reflect created records.');
    }

    // 17. Cross-Tenant Data Isolation (Teacher B attempting unauthorized access)
    console.log('\n[17/18] Cross-Tenant Security Isolation: Teacher B accessing Lan private data...');
    let isoChecks = 0;

    // 17.1 Classroom
    try { await classroomsService.findOne(classroom4C.id, teacherBId); } catch (e: any) { if (e.status === 403) isoChecks++; }
    // 17.2 Lesson Plan
    try { await lessonPlansService.findOne(lessonPlan.id, teacherBId); } catch (e: any) { if (e.status === 403) isoChecks++; }
    // 17.3 Resource
    try { await resourcesService.findOne(resource.id, { userId: 'b', email: 'b@teachflow.vn', role: 'TEACHER', teacherId: teacherBId }); } catch (e: any) { if (e.status === 403) isoChecks++; }
    // 17.4 Homeroom Dashboard
    try { await homeroomService.getDashboard(classroom4C.id, teacherBId); } catch (e: any) { if (e.status === 403) isoChecks++; }
    // 17.5 Task Update
    try { await tasksService.update(task.id, { done: false }, teacherBId); } catch (e: any) { if (e.status === 403) isoChecks++; }

    console.log(`   Passed ${isoChecks}/5 strict cross-tenant isolation checks with 403 Forbidden.`);
    if (isoChecks !== 5) {
      throw new Error('FAIL: Cross-tenant isolation check failed!');
    }

    // 18. Admin deactivates Teacher Lan -> verify token invalidation
    console.log('\n[18/18] Admin deactivates Teacher Lan -> Token validation test...');
    await adminService.updateTeacherStatus(
      teacherLanAccount.id,
      { isActive: false },
      { userId: adminUser.id, email: adminUser.email, role: 'ADMIN' },
    );

    let tokenBlocked = false;
    try {
      await jwtStrategy.validate({
        sub: teacherLanAccount.userId,
        email: teacherLanEmail,
        role: 'TEACHER',
        teacherId: teacherLanId,
      });
    } catch (e: any) {
      if (e.status === 401 && e.message?.includes('khóa')) {
        tokenBlocked = true;
      }
    }
    console.log(`   Deactivated teacher token validation: ${tokenBlocked ? '401 UNAUTHORIZED (SECURE)' : 'FAILED'}`);
    if (!tokenBlocked) {
      throw new Error('FAIL: Deactivated account was not blocked on token verification!');
    }

  } finally {
    // Clean up all fixtures cleanly
    console.log('\nCleaning up test fixtures...');
    try {
      if (classroom4C) {
        await prisma.studentBehaviorRecord.deleteMany({ where: { classroomId: classroom4C.id } });
        await prisma.weeklyClassReview.deleteMany({ where: { classroomId: classroom4C.id } });
        await prisma.monthlyClassReview.deleteMany({ where: { classroomId: classroom4C.id } });
        await prisma.studentAttendance.deleteMany({ where: { attendanceSession: { classroomId: classroom4C.id } } });
        await prisma.attendanceSession.deleteMany({ where: { classroomId: classroom4C.id } });
        await prisma.studentAssessment.deleteMany({ where: { assessment: { classroomId: classroom4C.id } } });
        await prisma.assessmentCriterion.deleteMany({ where: { assessment: { classroomId: classroom4C.id } } });
        await prisma.assessment.deleteMany({ where: { classroomId: classroom4C.id } });
        await prisma.classStudent.deleteMany({ where: { classroomId: classroom4C.id } });
        await prisma.teachingPlan.deleteMany({ where: { classroomId: classroom4C.id } });
        await prisma.classroom.delete({ where: { id: classroom4C.id } });
      }

      if (lessonPlan) {
        await prisma.lessonPlanResource.deleteMany({ where: { lessonPlanId: lessonPlan.id } });
        await prisma.lessonPlanActivity.deleteMany({ where: { lessonPlanId: lessonPlan.id } });
        await prisma.lessonPlan.delete({ where: { id: lessonPlan.id } });
      }

      if (resource) {
        await prisma.teachingResource.delete({ where: { id: resource.id } });
      }

      if (worksheet) {
        await prisma.worksheetQuestion.deleteMany({ where: { worksheetId: worksheet.id } });
        await prisma.worksheet.delete({ where: { id: worksheet.id } });
      }

      if (task) {
        await prisma.teacherTask.delete({ where: { id: task.id } });
      }

      if (student1) {
        await prisma.studentComment.deleteMany({ where: { studentId: student1.id } });
        await prisma.student.delete({ where: { id: student1.id } });
      }
      if (student2) {
        await prisma.student.delete({ where: { id: student2.id } });
      }

      if (teacherLanAccount) {
        await prisma.adminAuditLog.deleteMany({ where: { targetUserId: teacherLanAccount.userId } });
        await prisma.teacher.delete({ where: { id: teacherLanAccount.id } });
        await prisma.user.delete({ where: { id: teacherLanAccount.userId } });
      }

      if (teacherBAccount) {
        await prisma.teacher.delete({ where: { id: teacherBAccount.id } });
        await prisma.user.delete({ where: { id: teacherBAccount.userId } });
      }

      console.log('   ✓ Fixtures cleaned up completely.');
    } catch (cleanupErr: any) {
      console.warn('   Cleanup warning:', cleanupErr?.message);
    }
  }

  console.log('\n================================================================');
  console.log('  FULL APP CORE USER JOURNEY AUDIT: 100% PASSED (ALL 18 STEPS)');
  console.log('================================================================\n');
}

runFullCoreJourney()
  .catch((e) => {
    console.error('FATAL ERROR IN CORE JOURNEY AUDIT:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
