import { PrismaClient, BehaviorCategory, BehaviorLevel } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { HomeroomService } from '../src/homeroom/homeroom.service';
import { HomeroomExportService } from '../src/export/homeroom-export.service';

const prisma = new PrismaClient();
const jwtService = new JwtService({
  secret: process.env.JWT_SECRET || 'teachflow_super_secret_jwt_key_2026_dev',
});

async function main() {
  console.log('====================================================');
  console.log('  TEACHFLOW HOMEROOM MODULE E2E & SECURITY VERIFICATION');
  console.log('====================================================\n');

  const exportService = new HomeroomExportService();
  const homeroomService = new HomeroomService(prisma as any, exportService);

  // 1. Setup isolated fixtures
  const testId = Date.now().toString();
  const emailA = `teacher_a_${testId}@teachflow.vn`;
  const emailB = `teacher_b_${testId}@teachflow.vn`;
  const passwordHash = await bcrypt.hash('Password123!', 10);

  let userA: any;
  let userB: any;
  let teacherA: any;
  let teacherB: any;
  let classroomA: any;
  let classroomB: any;
  let studentA1: any;
  let studentA2: any;
  let studentB1: any;
  let schoolYear: any;
  let grade4: any;

  try {
    console.log('[1/8] Creating isolated test fixtures for Teacher A & Teacher B...');

    schoolYear = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!schoolYear) {
      schoolYear = await prisma.schoolYear.create({
        data: {
          name: `Năm học test ${testId}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-05-31'),
          isCurrent: true,
        },
      });
    }

    grade4 = await prisma.grade.findFirst({ where: { level: 4 } });
    if (!grade4) {
      grade4 = await prisma.grade.create({ data: { name: 'Khối 4', level: 4 } });
    }

    // Teacher A
    userA = await prisma.user.create({
      data: {
        email: emailA,
        passwordHash,
        role: 'TEACHER',
        teacher: {
          create: {
            fullName: `Cô Giáo A ${testId}`,
            phone: '0901111111',
          },
        },
      },
      include: { teacher: true },
    });
    teacherA = userA.teacher;

    // Teacher B
    userB = await prisma.user.create({
      data: {
        email: emailB,
        passwordHash,
        role: 'TEACHER',
        teacher: {
          create: {
            fullName: `Thầy Giáo B ${testId}`,
            phone: '0902222222',
          },
        },
      },
      include: { teacher: true },
    });
    teacherB = userB.teacher;

    // Classroom A
    classroomA = await prisma.classroom.create({
      data: {
        name: `4A-Test-${testId}`,
        gradeId: grade4.id,
        schoolYearId: schoolYear.id,
        teacherId: teacherA.id,
        room: 'P.401',
      },
    });

    // Classroom B
    classroomB = await prisma.classroom.create({
      data: {
        name: `4B-Test-${testId}`,
        gradeId: grade4.id,
        schoolYearId: schoolYear.id,
        teacherId: teacherB.id,
        room: 'P.402',
      },
    });

    // Students in Class A
    const in5Days = new Date();
    in5Days.setDate(in5Days.getDate() + 5);

    studentA1 = await prisma.student.create({
      data: {
        fullName: `Nguyễn Văn An ${testId}`,
        initials: 'NA',
        dateOfBirth: in5Days,
        dobString: `${in5Days.getDate()}/${in5Days.getMonth() + 1}/2016`,
        classStudents: {
          create: { classroomId: classroomA.id, status: 'ACTIVE' },
        },
      },
    });

    studentA2 = await prisma.student.create({
      data: {
        fullName: `Trần Thị Bình ${testId}`,
        initials: 'TB',
        dateOfBirth: new Date('2016-01-15'),
        classStudents: {
          create: { classroomId: classroomA.id, status: 'ACTIVE' },
        },
      },
    });

    // Student in Class B
    studentB1 = await prisma.student.create({
      data: {
        fullName: `Lê Hoàng Cường ${testId}`,
        initials: 'LC',
        dateOfBirth: new Date('2016-03-20'),
        classStudents: {
          create: { classroomId: classroomB.id, status: 'ACTIVE' },
        },
      },
    });

    console.log('   ✓ Fixtures created successfully.');

    // 2. Test Rule Engine: Students Need Attention
    console.log('\n[2/8] Testing Rule-based Students Need Attention (Time window 30 days)...');
    
    // Add 1 unexcused absence, 2 late for studentA1
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const session1 = await prisma.attendanceSession.create({
      data: {
        classroomId: classroomA.id,
        teacherId: teacherA.id,
        attendanceDate: today,
        sessionPeriod: 'FULL_DAY',
        attendances: {
          create: [
            { studentId: studentA1.id, status: 'UNEXCUSED_ABSENCE' },
            { studentId: studentA2.id, status: 'PRESENT' },
          ],
        },
      },
    });

    // Add 2 reminder behavior records for studentA1
    await homeroomService.createBehaviorRecord(
      {
        classroomId: classroomA.id,
        studentId: studentA1.id,
        recordDate: today.toISOString().split('T')[0],
        category: BehaviorCategory.DISCIPLINE,
        level: BehaviorLevel.REMINDER,
        content: 'Nói chuyện riêng trong giờ Toán',
      },
      teacherA.id,
    );

    await homeroomService.createBehaviorRecord(
      {
        classroomId: classroomA.id,
        studentId: studentA1.id,
        recordDate: today.toISOString().split('T')[0],
        category: BehaviorCategory.LEARNING,
        level: BehaviorLevel.REMINDER,
        content: 'Chưa chuẩn bị sách bài tập Tiếng Việt',
      },
      teacherA.id,
    );

    const attentionList = await homeroomService.getStudentsNeedAttention(classroomA.id, teacherA.id);
    console.log(`   Found ${attentionList.length} student(s) needing attention.`);
    if (attentionList.length === 1 && attentionList[0].studentId === studentA1.id) {
      console.log('   ✓ PASS: studentA1 correctly flagged with reasons:', attentionList[0].reasons.map(r => r.description));
    } else {
      throw new Error(`FAIL: Unexpected attention list: ${JSON.stringify(attentionList)}`);
    }

    // 3. Test Upcoming Birthdays
    console.log('\n[3/8] Testing Upcoming Birthdays (Countdown within 30 days)...');
    const birthdays = await homeroomService.getUpcomingBirthdays(classroomA.id, teacherA.id, 30);
    console.log(`   Found ${birthdays.length} birthday(s) coming up.`);
    if (birthdays.length === 1 && birthdays[0].studentId === studentA1.id && birthdays[0].daysUntilBirthday === 5) {
      console.log('   ✓ PASS: studentA1 birthday in 5 days correctly computed.');
    } else {
      throw new Error(`FAIL: Unexpected birthdays list: ${JSON.stringify(birthdays)}`);
    }

    // 4. Test Dashboard Aggregation
    console.log('\n[4/8] Testing Dashboard Aggregator API...');
    const dashboard = await homeroomService.getDashboard(classroomA.id, teacherA.id);
    if (
      dashboard.classroom.id === classroomA.id &&
      dashboard.attendanceToday.total === 2 &&
      dashboard.attendanceToday.unexcusedAbsence === 1 &&
      dashboard.attendanceToday.present === 1 &&
      dashboard.studentsNeedAttention.length === 1 &&
      dashboard.upcomingBirthdays.length === 1
    ) {
      console.log('   ✓ PASS: Dashboard data aggregated accurately.');
    } else {
      throw new Error(`FAIL: Dashboard aggregated incorrectly: ${JSON.stringify(dashboard)}`);
    }

    // 5. Test Weekly Review & Optimistic Concurrency
    console.log('\n[5/8] Testing Weekly Review Save & Optimistic Concurrency (409 Conflict)...');
    // Save 1: Create
    const savedReview1 = await homeroomService.saveWeeklyReview(
      {
        classroomId: classroomA.id,
        weekNumber: 3,
        strengths: 'Lớp 4A duy trì nề nếp tốt',
        limitations: 'Một số em còn nói chuyện riêng',
        nextWeekPlan: 'Kiểm tra đồ dùng học tập đầu tuần',
        version: 1,
      },
      teacherA.id,
    );
    console.log(`   Initial review created with version: ${savedReview1.version}`);

    // Save 2: Valid update with current version 1 -> becomes version 2
    const savedReview2 = await homeroomService.saveWeeklyReview(
      {
        classroomId: classroomA.id,
        weekNumber: 3,
        strengths: 'Cập nhật hợp lệ',
        version: savedReview1.version,
      },
      teacherA.id,
    );
    console.log(`   Valid update review saved with version: ${savedReview2.version}`);

    let conflictCaught = false;
    try {
      // Save 3: Stale client trying to save with old version 1 while DB is now at version 2
      await homeroomService.saveWeeklyReview(
        {
          classroomId: classroomA.id,
          weekNumber: 3,
          strengths: 'Ghi đè xung đột (stale version 1)',
          version: 1,
        },
        teacherA.id,
      );
    } catch (err: any) {
      if (err.status === 409 || err.message?.includes('phiên làm việc khác')) {
        conflictCaught = true;
        console.log('   ✓ PASS: 409 Conflict correctly thrown on stale version (version 1 vs version 2 in DB).');
      }
    }

    if (!conflictCaught) {
      throw new Error('FAIL: Optimistic concurrency check failed to reject version mismatch.');
    }

    // 6. Test Export Services (DOCX & PDF)
    console.log('\n[6/8] Testing Export Weekly & Monthly Reports (Word/PDF)...');
    const weeklyDocx = await homeroomService.exportWeeklyReview(classroomA.id, 3, schoolYear.id, teacherA.id, 'docx');
    const weeklyPdf = await homeroomService.exportWeeklyReview(classroomA.id, 3, schoolYear.id, teacherA.id, 'pdf');
    const monthlyDocx = await homeroomService.exportMonthlySummary(classroomA.id, 2026, 8, teacherA.id, 'docx');
    const monthlyPdf = await homeroomService.exportMonthlySummary(classroomA.id, 2026, 8, teacherA.id, 'pdf');

    if (
      weeklyDocx.buffer.length > 500 &&
      weeklyPdf.buffer.length > 500 &&
      monthlyDocx.buffer.length > 500 &&
      monthlyPdf.buffer.length > 500
    ) {
      console.log('   ✓ PASS: All 4 DOCX and PDF export buffers generated with valid size.');
    } else {
      throw new Error('FAIL: Export buffers are too small or empty.');
    }

    // 7. Security Isolation: Teacher A attempting unauthorized operations on Teacher B
    console.log('\n[7/8] Testing Cross-Tenant Security Isolation (Teacher A vs Teacher B)...');

    // 7.1 Teacher A accessing Teacher B dashboard
    let tADashForbidden = false;
    try {
      await homeroomService.getDashboard(classroomB.id, teacherA.id);
    } catch (err: any) {
      if (err.status === 403) tADashForbidden = true;
    }
    console.log(`   Teacher A -> Teacher B Dashboard: ${tADashForbidden ? '403 FORBIDDEN (SECURE)' : 'FAILED'}`);

    // 7.2 Teacher A creating behavior for Teacher B student
    let tABehaviorForbidden = false;
    try {
      await homeroomService.createBehaviorRecord(
        {
          classroomId: classroomB.id,
          studentId: studentB1.id,
          recordDate: '2026-08-20',
          category: BehaviorCategory.DISCIPLINE,
          level: BehaviorLevel.NEEDS_ATTENTION,
          content: 'Attacker injection',
        },
        teacherA.id,
      );
    } catch (err: any) {
      if (err.status === 403) tABehaviorForbidden = true;
    }
    console.log(`   Teacher A -> Create Behavior in Teacher B Class: ${tABehaviorForbidden ? '403 FORBIDDEN (SECURE)' : 'FAILED'}`);

    // 7.3 Teacher A saving Weekly Review for Teacher B classroom
    let tAWeeklyForbidden = false;
    try {
      await homeroomService.saveWeeklyReview(
        {
          classroomId: classroomB.id,
          weekNumber: 3,
          strengths: 'Malicious review',
        },
        teacherA.id,
      );
    } catch (err: any) {
      if (err.status === 403) tAWeeklyForbidden = true;
    }
    console.log(`   Teacher A -> Save Weekly Review in Teacher B Class: ${tAWeeklyForbidden ? '403 FORBIDDEN (SECURE)' : 'FAILED'}`);

    // 7.4 Teacher A exporting Teacher B report
    let tAExportForbidden = false;
    try {
      await homeroomService.exportWeeklyReview(classroomB.id, 3, schoolYear.id, teacherA.id, 'docx');
    } catch (err: any) {
      if (err.status === 403) tAExportForbidden = true;
    }
    console.log(`   Teacher A -> Export Teacher B Weekly Report: ${tAExportForbidden ? '403 FORBIDDEN (SECURE)' : 'FAILED'}`);

    if (!tADashForbidden || !tABehaviorForbidden || !tAWeeklyForbidden || !tAExportForbidden) {
      throw new Error('FAIL: Data isolation invariant violated!');
    }

    console.log('\n[8/8] Cleaning up all test fixtures...');
  } finally {
    // 8. Clean up test fixtures cleanly
    try {
      if (classroomA) {
        await prisma.studentBehaviorRecord.deleteMany({ where: { classroomId: classroomA.id } });
        await prisma.weeklyClassReview.deleteMany({ where: { classroomId: classroomA.id } });
        await prisma.monthlyClassReview.deleteMany({ where: { classroomId: classroomA.id } });
        await prisma.studentAttendance.deleteMany({
          where: { attendanceSession: { classroomId: classroomA.id } },
        });
        await prisma.attendanceSession.deleteMany({ where: { classroomId: classroomA.id } });
        await prisma.classStudent.deleteMany({ where: { classroomId: classroomA.id } });
        await prisma.classroom.delete({ where: { id: classroomA.id } });
      }

      if (classroomB) {
        await prisma.studentBehaviorRecord.deleteMany({ where: { classroomId: classroomB.id } });
        await prisma.weeklyClassReview.deleteMany({ where: { classroomId: classroomB.id } });
        await prisma.monthlyClassReview.deleteMany({ where: { classroomId: classroomB.id } });
        await prisma.classStudent.deleteMany({ where: { classroomId: classroomB.id } });
        await prisma.classroom.delete({ where: { id: classroomB.id } });
      }

      if (studentA1) await prisma.student.delete({ where: { id: studentA1.id } });
      if (studentA2) await prisma.student.delete({ where: { id: studentA2.id } });
      if (studentB1) await prisma.student.delete({ where: { id: studentB1.id } });

      if (teacherA) await prisma.teacher.delete({ where: { id: teacherA.id } });
      if (userA) await prisma.user.delete({ where: { id: userA.id } });

      if (teacherB) await prisma.teacher.delete({ where: { id: teacherB.id } });
      if (userB) await prisma.user.delete({ where: { id: userB.id } });

      console.log('   ✓ Test fixtures cleaned up completely.');
    } catch (cleanupErr: any) {
      console.warn('   Note during cleanup:', cleanupErr?.message);
    }
  }

  console.log('\n====================================================');
  console.log('  ALL HOMEROOM E2E & SECURITY CHECKS PASSED (100%)');
  console.log('====================================================');
}

main()
  .catch((e) => {
    console.error('FATAL ERROR IN E2E TEST:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
