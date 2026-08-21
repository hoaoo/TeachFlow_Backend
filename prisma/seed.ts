import { PrismaClient, TaskStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`Seeding TeachFlow database (mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'})...`);

  // 1. Production Mode Seed Logic
  if (isProduction) {
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();

    if ((bootstrapEmail && !bootstrapPassword) || (!bootstrapEmail && bootstrapPassword)) {
      throw new Error(
        'Production admin bootstrap failed: Both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be provided together.',
      );
    }

    if (bootstrapEmail && bootstrapPassword) {
      if (bootstrapPassword.length < 12) {
        throw new Error('Production admin bootstrap failed: BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
      }

      const adminPasswordHash = await bcrypt.hash(bootstrapPassword, 10);
      const adminUser = await prisma.user.upsert({
        where: { email: bootstrapEmail.toLowerCase() },
        update: { passwordHash: adminPasswordHash, role: 'ADMIN', isActive: true },
        create: {
          email: bootstrapEmail.toLowerCase(),
          passwordHash: adminPasswordHash,
          role: 'ADMIN',
          isActive: true,
        },
      });

      console.log(`[PRODUCTION BOOTSTRAP] Initial Admin account ensured for: ${adminUser.email}`);
    } else {
      console.log(
        '[PRODUCTION] No BOOTSTRAP_ADMIN_EMAIL/PASSWORD provided. Skipping initial user seed to protect existing production data.',
      );
    }

    // Ensure fundamental base data (School Year, Semesters, Grades, Subjects) without mock classrooms/teachers/students
    const sy2627 = await prisma.schoolYear.upsert({
      where: { name: '2026 - 2027' },
      update: { isCurrent: true, isActive: true },
      create: {
        name: '2026 - 2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-05-31'),
        isCurrent: true,
        isActive: true,
      },
    });

    await prisma.semester.upsert({
      where: { schoolYearId_code: { schoolYearId: sy2627.id, code: 'HK1' } },
      update: { name: 'Học kỳ I', startDate: new Date('2026-09-01'), endDate: new Date('2027-01-15'), sortOrder: 1 },
      create: { schoolYearId: sy2627.id, code: 'HK1', name: 'Học kỳ I', startDate: new Date('2026-09-01'), endDate: new Date('2027-01-15'), sortOrder: 1, isActive: true },
    });

    await prisma.semester.upsert({
      where: { schoolYearId_code: { schoolYearId: sy2627.id, code: 'HK2' } },
      update: { name: 'Học kỳ II', startDate: new Date('2027-01-16'), endDate: new Date('2027-05-31'), sortOrder: 2 },
      create: { schoolYearId: sy2627.id, code: 'HK2', name: 'Học kỳ II', startDate: new Date('2027-01-16'), endDate: new Date('2027-05-31'), sortOrder: 2, isActive: true },
    });

    for (const level of [1, 2, 3, 4, 5]) {
      const code = `K${level.toString().padStart(2, '0')}`;
      const existing = await prisma.grade.findFirst({ where: { level } });
      if (existing) {
        await prisma.grade.update({
          where: { id: existing.id },
          data: { code, name: `Khối ${level}`, sortOrder: level, isActive: true },
        });
      } else {
        await prisma.grade.create({
          data: { code, name: `Khối ${level}`, level, sortOrder: level, isActive: true },
        });
      }
    }

    const subjectsData = [
      { code: 'TOAN', name: 'Toán', sortOrder: 1 },
      { code: 'VIETNAMESE', name: 'Tiếng Việt', sortOrder: 2 },
      { code: 'TA', name: 'Tiếng Anh', sortOrder: 3 },
      { code: 'SCIENCE', name: 'Khoa học', sortOrder: 4 },
      { code: 'HISTORY_GEO', name: 'Lịch sử và Địa lí', sortOrder: 5 },
      { code: 'INFORMATICS', name: 'Tin học', sortOrder: 6 },
      { code: 'TECHNOLOGY', name: 'Công nghệ', sortOrder: 7 },
      { code: 'ETHICS', name: 'Đạo đức', sortOrder: 8 },
      { code: 'AN', name: 'Âm nhạc', sortOrder: 9 },
      { code: 'MT', name: 'Mĩ thuật', sortOrder: 10 },
      { code: 'GDTC', name: 'Giáo dục thể chất', sortOrder: 11 },
      { code: 'HDTN', name: 'Hoạt động trải nghiệm', sortOrder: 12 },
    ];

    for (const s of subjectsData) {
      await prisma.subject.upsert({
        where: { code: s.code },
        update: { name: s.name, sortOrder: s.sortOrder, isActive: true, status: 'ACTIVE' },
        create: { code: s.code, name: s.name, sortOrder: s.sortOrder, isActive: true, status: 'ACTIVE' },
      });
    }

    console.log('[PRODUCTION] Fundamental reference data verified. Production seed completed safely!');
    return;
  }

  // 2. Development Mode Seed Logic (Idempotent for local development)
  const adminPasswordHash = await bcrypt.hash('Admin@123456', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@teachflow.vn' },
    update: { passwordHash: adminPasswordHash, role: 'ADMIN', isActive: true },
    create: {
      email: 'admin@teachflow.vn',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log(`Development Admin created/ensured: ${adminUser.email}`);

  const teacherPasswordHash = await bcrypt.hash('Password123@', 10);

  const user = await prisma.user.upsert({
    where: { email: 'teacher@teachflow.vn' },
    update: { passwordHash: teacherPasswordHash },
    create: {
      email: 'teacher@teachflow.vn',
      passwordHash: teacherPasswordHash,
      role: 'TEACHER',
      isActive: true,
    },
  });

  const teacher = await prisma.teacher.upsert({
    where: { userId: user.id },
    update: { fullName: 'Nguyễn Thị Mai' },
    create: {
      userId: user.id,
      fullName: 'Nguyễn Thị Mai',
      phone: '0988 123 456',
    },
  });

  console.log(`Teacher created/ensured: ${teacher.fullName} (${user.email})`);

  // SchoolYears & Semesters
  const sy2526 = await prisma.schoolYear.upsert({
    where: { name: '2025 - 2026' },
    update: { isCurrent: false, isActive: true },
    create: {
      name: '2025 - 2026',
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-05-31'),
      isCurrent: false,
      isActive: true,
    },
  });

  await prisma.semester.upsert({
    where: { schoolYearId_code: { schoolYearId: sy2526.id, code: 'HK1' } },
    update: { name: 'Học kỳ I', startDate: new Date('2025-09-01'), endDate: new Date('2026-01-15'), sortOrder: 1 },
    create: { schoolYearId: sy2526.id, code: 'HK1', name: 'Học kỳ I', startDate: new Date('2025-09-01'), endDate: new Date('2026-01-15'), sortOrder: 1, isActive: true },
  });

  await prisma.semester.upsert({
    where: { schoolYearId_code: { schoolYearId: sy2526.id, code: 'HK2' } },
    update: { name: 'Học kỳ II', startDate: new Date('2026-01-16'), endDate: new Date('2026-05-31'), sortOrder: 2 },
    create: { schoolYearId: sy2526.id, code: 'HK2', name: 'Học kỳ II', startDate: new Date('2026-01-16'), endDate: new Date('2026-05-31'), sortOrder: 2, isActive: true },
  });

  const sy2627 = await prisma.schoolYear.upsert({
    where: { name: '2026 - 2027' },
    update: { isCurrent: true, isActive: true },
    create: {
      name: '2026 - 2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-05-31'),
      isCurrent: true,
      isActive: true,
    },
  });

  await prisma.semester.upsert({
    where: { schoolYearId_code: { schoolYearId: sy2627.id, code: 'HK1' } },
    update: { name: 'Học kỳ I', startDate: new Date('2026-09-01'), endDate: new Date('2027-01-15'), sortOrder: 1 },
    create: { schoolYearId: sy2627.id, code: 'HK1', name: 'Học kỳ I', startDate: new Date('2026-09-01'), endDate: new Date('2027-01-15'), sortOrder: 1, isActive: true },
  });

  await prisma.semester.upsert({
    where: { schoolYearId_code: { schoolYearId: sy2627.id, code: 'HK2' } },
    update: { name: 'Học kỳ II', startDate: new Date('2027-01-16'), endDate: new Date('2027-05-31'), sortOrder: 2 },
    create: { schoolYearId: sy2627.id, code: 'HK2', name: 'Học kỳ II', startDate: new Date('2027-01-16'), endDate: new Date('2027-05-31'), sortOrder: 2, isActive: true },
  });

  // Grades (Khối 1 -> Khối 5)
  const grades: Record<number, any> = {};
  for (const level of [1, 2, 3, 4, 5]) {
    const code = `K${level.toString().padStart(2, '0')}`;
    let g = await prisma.grade.findFirst({ where: { level } });
    if (g) {
      grades[level] = await prisma.grade.update({
        where: { id: g.id },
        data: { code, name: `Khối ${level}`, sortOrder: level, isActive: true },
      });
    } else {
      grades[level] = await prisma.grade.create({
        data: { code, name: `Khối ${level}`, level, sortOrder: level, isActive: true },
      });
    }
  }

  // Subjects (12 môn chuẩn)
  const subjectsData = [
    { code: 'MATH', name: 'Toán', sortOrder: 1 },
    { code: 'VIETNAMESE', name: 'Tiếng Việt', sortOrder: 2 },
    { code: 'TA', name: 'Tiếng Anh', sortOrder: 3 },
    { code: 'SCIENCE', name: 'Khoa học', sortOrder: 4 },
    { code: 'HISTORY_GEO', name: 'Lịch sử và Địa lí', sortOrder: 5 },
    { code: 'INFORMATICS', name: 'Tin học', sortOrder: 6 },
    { code: 'TECHNOLOGY', name: 'Công nghệ', sortOrder: 7 },
    { code: 'ETHICS', name: 'Đạo đức', sortOrder: 8 },
    { code: 'AN', name: 'Âm nhạc', sortOrder: 9 },
    { code: 'MT', name: 'Mĩ thuật', sortOrder: 10 },
    { code: 'GDTC', name: 'Giáo dục thể chất', sortOrder: 11 },
    { code: 'HDTN', name: 'Hoạt động trải nghiệm', sortOrder: 12 },
  ];

  const subjects: Record<string, any> = {};
  for (const s of subjectsData) {
    subjects[s.code] = await prisma.subject.upsert({
      where: { code: s.code },
      update: { name: s.name, sortOrder: s.sortOrder, isActive: true, status: 'ACTIVE' },
      create: { code: s.code, name: s.name, sortOrder: s.sortOrder, isActive: true, status: 'ACTIVE' },
    });
  }

  // Classrooms
  let class4A = await prisma.classroom.findFirst({
    where: { schoolYearId: sy2627.id, code: '4A', deletedAt: null },
  });
  if (!class4A) {
    class4A = await prisma.classroom.create({
      data: {
        code: '4A',
        name: 'Lớp 4A',
        gradeId: grades[4].id,
        schoolYearId: sy2627.id,
        teacherId: teacher.id,
        room: 'Phòng 204',
        schedule: 'Sáng · Thứ 2 - Thứ 6',
        accent: 'teal',
        isActive: true,
      },
    });
  }

  let class4B = await prisma.classroom.findFirst({
    where: { schoolYearId: sy2627.id, code: '4B', deletedAt: null },
  });
  if (!class4B) {
    class4B = await prisma.classroom.create({
      data: {
        code: '4B',
        name: 'Lớp 4B',
        gradeId: grades[4].id,
        schoolYearId: sy2627.id,
        teacherId: teacher.id,
        room: 'Phòng 101',
        schedule: 'Chiều · Thứ 2 - Thứ 6',
        accent: 'blue',
        isActive: true,
      },
    });
  }

  let class3A = await prisma.classroom.findFirst({
    where: { schoolYearId: sy2627.id, code: '3A', deletedAt: null },
  });
  if (!class3A) {
    class3A = await prisma.classroom.create({
      data: {
        code: '3A',
        name: 'Lớp 3A',
        gradeId: grades[3].id,
        schoolYearId: sy2627.id,
        teacherId: teacher.id,
        room: 'Phòng 103',
        schedule: 'Sáng · Thứ 2 - Thứ 6',
        accent: 'orange',
        isActive: true,
      },
    });
  }

  const students4A = [
    { name: 'Nguyễn Văn An', initials: 'NA', gender: 'MALE', dob: '12/04/2016', guardian: 'Nguyễn Thị Hoa', phone: '0901 234 567', status: 'EXCELLENT', color: 'bg-teal-100 text-teal-700', note: 'Chủ động phát biểu, hoàn thành bài đúng hạn.' },
    { name: 'Trần Mai Anh', initials: 'MA', gender: 'FEMALE', dob: '24/08/2016', guardian: 'Trần Văn Minh', phone: '0902 345 678', status: 'EXCELLENT', color: 'bg-blue-100 text-blue-700', note: 'Có tiến bộ rõ trong kỹ năng trình bày.' },
    { name: 'Lê Gia Huy', initials: 'GH', gender: 'MALE', dob: '03/02/2016', guardian: 'Lê Thị Lan', phone: '0903 456 789', status: 'EXCELLENT', color: 'bg-indigo-100 text-indigo-700', note: 'Tư duy tốt, cần rèn thêm tính cẩn thận.' },
    { name: 'Phạm Khánh Linh', initials: 'KL', gender: 'FEMALE', dob: '19/11/2016', guardian: 'Phạm Quốc Dũng', phone: '0904 567 890', status: 'GOOD', color: 'bg-orange-100 text-orange-700', note: 'Đọc hiểu tốt, cần mạnh dạn chia sẻ ý kiến.' },
    { name: 'Đỗ Đức Minh', initials: 'ĐM', gender: 'MALE', dob: '07/06/2016', guardian: 'Đỗ Thị Hương', phone: '0905 678 901', status: 'NEEDS_SUPPORT', color: 'bg-rose-100 text-rose-700', note: 'Cần hỗ trợ thêm khi giải bài toán có lời văn.' },
    { name: 'Vũ Ngọc Hà', initials: 'NH', gender: 'FEMALE', dob: '28/01/2016', guardian: 'Vũ Văn Sơn', phone: '0906 789 012', status: 'GOOD', color: 'bg-purple-100 text-purple-700', note: 'Hợp tác tốt trong hoạt động nhóm.' },
    { name: 'Hoàng Quốc Bảo', initials: 'QB', gender: 'MALE', dob: '15/05/2016', guardian: 'Hoàng Văn Tuấn', phone: '0907 890 123', status: 'EXCELLENT', color: 'bg-teal-100 text-teal-700', note: 'Làm bài nhanh và chính xác.' },
    { name: 'Bùi Thùy Dung', initials: 'TD', gender: 'FEMALE', dob: '09/09/2016', guardian: 'Bùi Văn Hùng', phone: '0908 901 234', status: 'GOOD', color: 'bg-blue-100 text-blue-700', note: 'Chăm chỉ, hoàn thành bài tập đầy đủ.' },
  ];

  const students4B = [
    { name: 'Nguyễn Minh Thảo', initials: 'MT', gender: 'FEMALE', dob: '11/03/2016', guardian: 'Nguyễn Văn Hải', phone: '0911 234 567', status: 'EXCELLENT', color: 'bg-blue-100 text-blue-700', note: 'Tích cực trong hoạt động trải nghiệm.' },
    { name: 'Phan Minh Khoa', initials: 'MK', gender: 'MALE', dob: '16/09/2016', guardian: 'Phan Thị Mai', phone: '0912 345 678', status: 'EXCELLENT', color: 'bg-teal-100 text-teal-700', note: 'Có khả năng hỗ trợ bạn trong nhóm.' },
    { name: 'Đặng Hải Yến', initials: 'HY', gender: 'FEMALE', dob: '22/05/2016', guardian: 'Đặng Văn Lâm', phone: '0913 456 789', status: 'GOOD', color: 'bg-orange-100 text-orange-700', note: 'Cần duy trì thói quen đọc sách mỗi ngày.' },
    { name: 'Ngô Quang Khải', initials: 'QK', gender: 'MALE', dob: '14/12/2016', guardian: 'Ngô Văn Thắng', phone: '0914 567 890', status: 'GOOD', color: 'bg-indigo-100 text-indigo-700', note: 'Tham gia sôi nổi các trò chơi học tập.' },
  ];

  const students3A = [
    { name: 'Nguyễn Bảo Quỳnh', initials: 'BQ', gender: 'FEMALE', dob: '02/10/2017', guardian: 'Nguyễn Văn Nam', phone: '0921 234 567', status: 'EXCELLENT', color: 'bg-orange-100 text-orange-700', note: 'Nắm bài nhanh và trình bày sạch đẹp.' },
    { name: 'Trần Hoàng Long', initials: 'HL', gender: 'MALE', dob: '13/07/2017', guardian: 'Trần Thị Hạnh', phone: '0922 345 678', status: 'GOOD', color: 'bg-teal-100 text-teal-700', note: 'Cần chú ý nghe hướng dẫn trước khi làm bài.' },
  ];

  const seedClassStudents = async (studentsList: typeof students4A, targetClass: typeof class4A) => {
    for (const s of studentsList) {
      let student = await prisma.student.findFirst({
        where: { fullName: s.name, dobString: s.dob, deletedAt: null },
      });
      if (!student) {
        student = await prisma.student.create({
          data: {
            fullName: s.name,
            initials: s.initials,
            gender: s.gender as any,
            dobString: s.dob,
            parentName: s.guardian,
            parentPhone: s.phone,
            status: s.status as any,
            avatarColor: s.color,
          },
        });
      }

      const existingClassStudent = await prisma.classStudent.findFirst({
        where: { classroomId: targetClass.id, studentId: student.id },
      });
      if (!existingClassStudent) {
        await prisma.classStudent.create({
          data: { classroomId: targetClass.id, studentId: student.id, status: 'ACTIVE' },
        });
      }

      const existingEnrollment = await prisma.studentEnrollment.findFirst({
        where: {
          studentId: student.id,
          classroomId: targetClass.id,
          schoolYearId: targetClass.schoolYearId,
        },
      });
      if (!existingEnrollment) {
        await prisma.studentEnrollment.create({
          data: {
            studentId: student.id,
            classroomId: targetClass.id,
            schoolYearId: targetClass.schoolYearId,
            status: 'ACTIVE',
            enrolledAt: new Date('2026-09-01'),
          },
        });
      }

      const existingComment = await prisma.studentComment.findFirst({
        where: { studentId: student.id, classroomId: targetClass.id, teacherId: teacher.id },
      });
      if (!existingComment) {
        await prisma.studentComment.create({
          data: {
            studentId: student.id,
            teacherId: teacher.id,
            classroomId: targetClass.id,
            content: s.note,
          },
        });
      }
    }
  };

  await seedClassStudents(students4A, class4A);
  await seedClassStudents(students4B, class4B);
  await seedClassStudents(students3A, class3A);

  let lessonPlan1 = await prisma.lessonPlan.findFirst({
    where: { teacherId: teacher.id, title: 'Phân số bằng nhau', deletedAt: null },
  });

  if (!lessonPlan1) {
    lessonPlan1 = await prisma.lessonPlan.create({
      data: {
        teacherId: teacher.id,
        classroomId: class4A.id,
        subjectId: subjects.MATH.id,
        title: 'Phân số bằng nhau',
        subjectName: 'Toán',
        gradeName: 'Lớp 4A',
        teachingDate: new Date('2026-08-21'),
        durationMinutes: 40,
        objectives: 'Nhận biết được các phân số bằng nhau và vận dụng để giải quyết bài toán thực tế.',
        status: 'COMPLETED',
        version: 1,
        activities: {
          create: [
            {
              phase: 'Khởi động',
              title: 'Trò chơi: Ai nhanh hơn?',
              durationMinutes: 5,
              method: 'Trò chơi học tập',
              technique: 'Động não',
              competencies: 'Giao tiếp và hợp tác',
              qualities: 'Chăm chỉ',
              objective: 'Tạo hứng thú và kết nối kiến thức đã học với bài mới.',
              teacherActivity: 'GV tổ chức trò chơi nhận diện các cặp phân số bằng nhau. Đặt câu hỏi gợi mở và dẫn dắt vào bài.',
              studentActivity: 'HS tham gia trò chơi theo nhóm, suy nghĩ nhanh và chia sẻ cách nhận biết của mình.',
              sortOrder: 0,
            },
            {
              phase: 'Khám phá',
              title: 'Tìm hiểu phân số bằng nhau',
              durationMinutes: 15,
              method: 'Trực quan – thảo luận nhóm',
              technique: 'Mảnh ghép',
              competencies: 'Tư duy và lập luận toán học',
              qualities: 'Trung thực',
              objective: 'HS hình thành quy tắc tạo phân số bằng nhau.',
              teacherActivity: 'GV giao nhiệm vụ với các băng giấy, theo dõi nhóm và đặt câu hỏi: Em nhận thấy điều gì?',
              studentActivity: 'HS gấp, tô màu băng giấy; thảo luận và trình bày phát hiện bằng ngôn ngữ của mình.',
              sortOrder: 1,
            },
            {
              phase: 'Luyện tập',
              title: 'Thử thách phân số',
              durationMinutes: 12,
              method: 'Luyện tập cá nhân',
              technique: 'Khăn trải bàn',
              competencies: 'Giải quyết vấn đề',
              qualities: 'Trách nhiệm',
              objective: 'Củng cố quy tắc qua các bài tập từ nhận biết đến vận dụng.',
              teacherActivity: 'GV phát phiếu 3 mức độ, hỗ trợ nhóm cần giúp đỡ và tổ chức chữa bài nhanh.',
              studentActivity: 'HS hoàn thành phiếu, đổi bài kiểm tra theo cặp và giải thích cách làm.',
              sortOrder: 2,
            },
            {
              phase: 'Vận dụng',
              title: 'Phân số quanh em',
              durationMinutes: 8,
              method: 'Dự án nhỏ',
              technique: 'Trình bày một phút',
              competencies: 'Vận dụng kiến thức',
              qualities: 'Trách nhiệm',
              objective: 'Vận dụng phân số bằng nhau để mô tả tình huống thực tế.',
              teacherActivity: 'GV yêu cầu HS tìm một ví dụ trong đời sống và mời đại diện chia sẻ.',
              studentActivity: 'HS tạo ví dụ minh họa, trình bày ngắn gọn và nhận xét sản phẩm của bạn.',
              sortOrder: 3,
            },
          ],
        },
      },
    });
  }

  const teachingPlansData = [
    { teacherId: teacher.id, classroomId: class4A.id, subjectId: subjects.MATH.id, schoolYearId: sy2627.id, title: 'Phân số bằng nhau', subtitle: 'Toán · Lớp 4A', status: 'Đã lên lịch', meta: '07:30 · Phòng 204', tone: 'teal', room: 'Phòng 204', weekNumber: 3 },
    { teacherId: teacher.id, classroomId: class4A.id, subjectId: subjects.VIETNAMESE.id, schoolYearId: sy2627.id, title: 'Luyện tập miêu tả cây cối', subtitle: 'Tiếng Việt · Lớp 4A', status: 'Sắp tới', meta: '09:15 · Phòng 204', tone: 'orange', room: 'Phòng 204', weekNumber: 3 },
    { teacherId: teacher.id, classroomId: class4B.id, subjectId: subjects.SCIENCE.id, schoolYearId: sy2627.id, title: 'Âm thanh trong cuộc sống', subtitle: 'Khoa học · Lớp 4B', status: 'Sắp tới', meta: '14:00 · Phòng 101', tone: 'blue', room: 'Phòng 101', weekNumber: 3 },
  ];

  for (const tp of teachingPlansData) {
    const existing = await prisma.teachingPlan.findFirst({
      where: { teacherId: tp.teacherId, classroomId: tp.classroomId, title: tp.title },
    });
    if (!existing) {
      await prisma.teachingPlan.create({ data: tp });
    }
  }

  const assignmentsData = [
    { teacherId: teacher.id, classroomId: class4A.id, subjectId: subjects.MATH.id, schoolYearId: sy2627.id },
    { teacherId: teacher.id, classroomId: class4A.id, subjectId: subjects.VIETNAMESE.id, schoolYearId: sy2627.id },
    { teacherId: teacher.id, classroomId: class4A.id, subjectId: subjects.SCIENCE.id, schoolYearId: sy2627.id },
    { teacherId: teacher.id, classroomId: class4B.id, subjectId: subjects.MATH.id, schoolYearId: sy2627.id },
    { teacherId: teacher.id, classroomId: class4B.id, subjectId: subjects.VIETNAMESE.id, schoolYearId: sy2627.id },
    { teacherId: teacher.id, classroomId: class3A.id, subjectId: subjects.VIETNAMESE.id, schoolYearId: sy2627.id },
  ];

  for (const asg of assignmentsData) {
    const existing = await prisma.teachingAssignment.findFirst({
      where: {
        teacherId: asg.teacherId,
        classroomId: asg.classroomId,
        subjectId: asg.subjectId,
        schoolYearId: asg.schoolYearId,
      },
    });
    if (!existing) {
      await prisma.teachingAssignment.create({ data: { ...asg, isActive: true } });
    }
  }

  const activitiesData = [
    { teacherId: teacher.id, title: 'Bingo phân số', subjectName: 'Toán', gradeName: 'Lớp 4', typeName: 'Trò chơi', usesCount: 128, icon: 'Grid2X2', isPublic: true },
    { teacherId: teacher.id, title: 'Chiếc hộp bí mật', subjectName: 'Tiếng Việt', gradeName: 'Lớp 3-5', typeName: 'Khởi động', usesCount: 96, icon: 'Gift', isPublic: true },
    { teacherId: teacher.id, title: 'Nhà khoa học nhí', subjectName: 'Khoa học', gradeName: 'Lớp 4', typeName: 'Khám phá', usesCount: 74, icon: 'FlaskConical', isPublic: true },
  ];

  for (const act of activitiesData) {
    const existing = await prisma.teachingActivity.findFirst({
      where: { teacherId: act.teacherId, title: act.title },
    });
    if (!existing) {
      await prisma.teachingActivity.create({ data: act });
    }
  }

  const worksheetsData = [
    { teacherId: teacher.id, title: 'Phiếu luyện tập phân số', subtitle: 'Toán · Lớp 4', status: 'Đã xuất bản', meta: '12 câu hỏi · 4A', tone: 'teal' },
    { teacherId: teacher.id, title: 'Miêu tả cây cối', subtitle: 'Tiếng Việt · Lớp 4', status: 'Bản nháp', meta: '8 câu hỏi · Cập nhật hôm nay', tone: 'orange' },
    { teacherId: teacher.id, title: 'Âm thanh quanh em', subtitle: 'Khoa học · Lớp 4', status: 'Đã xuất bản', meta: '10 câu hỏi · 4B', tone: 'blue' },
  ];

  for (const ws of worksheetsData) {
    const existing = await prisma.worksheet.findFirst({
      where: { teacherId: ws.teacherId, title: ws.title, deletedAt: null },
    });
    if (!existing) {
      await prisma.worksheet.create({ data: ws });
    }
  }

  const assessmentsData = [
    { teacherId: teacher.id, classroomId: class4A.id, subjectId: subjects.MATH.id, title: 'Đánh giá giữa kỳ I', subtitle: 'Toán · Lớp 4A', status: 'Đang thực hiện', meta: '28/32 học sinh', tone: 'teal' },
    { teacherId: teacher.id, classroomId: class4A.id, subjectId: subjects.VIETNAMESE.id, title: 'Rubric thuyết trình', subtitle: 'Tiếng Việt · Lớp 4A', status: 'Bản nháp', meta: '4 tiêu chí', tone: 'violet' },
    { teacherId: teacher.id, classroomId: class4B.id, subjectId: subjects.SCIENCE.id, title: 'Quan sát thực hành', subtitle: 'Khoa học · Lớp 4B', status: 'Hoàn thành', meta: '30/30 học sinh', tone: 'blue' },
  ];

  for (const asm of assessmentsData) {
    const existing = await prisma.assessment.findFirst({
      where: { teacherId: asm.teacherId, classroomId: asm.classroomId, title: asm.title, deletedAt: null },
    });
    if (!existing) {
      await prisma.assessment.create({ data: asm });
    }
  }

  const tasksData = [
    { teacherId: teacher.id, title: 'Hoàn thiện giáo án Toán - Tuần 3', dueDate: 'Hôm nay', done: true, status: TaskStatus.COMPLETED },
    { teacherId: teacher.id, title: 'Nhận xét học sinh tháng 8', dueDate: 'Còn 2 ngày', done: false, status: TaskStatus.PENDING },
    { teacherId: teacher.id, title: 'Chuẩn bị phiếu học tập Tiếng Việt', dueDate: 'Thứ Sáu', done: false, status: TaskStatus.PENDING },
    { teacherId: teacher.id, title: 'Cập nhật sổ chủ nhiệm', dueDate: 'Thứ Sáu', done: false, status: TaskStatus.PENDING },
  ];

  for (const t of tasksData) {
    const existing = await prisma.teacherTask.findFirst({
      where: { teacherId: t.teacherId, title: t.title },
    });
    if (!existing) {
      await prisma.teacherTask.create({ data: t });
    }
  }

  const today = new Date('2026-08-20');
  today.setHours(0, 0, 0, 0);

  const existingSession = await prisma.attendanceSession.findFirst({
    where: { classroomId: class4A.id, attendanceDate: today },
  });

  if (!existingSession) {
    await prisma.attendanceSession.create({
      data: {
        classroomId: class4A.id,
        teacherId: teacher.id,
        attendanceDate: today,
        sessionPeriod: 'MORNING',
        title: 'Lớp 4A · Thứ Tư 20/08',
        meta: '31 có mặt · 1 phép',
        status: 'Đã điểm danh',
        tone: 'teal',
      },
    });
  }

  console.log('Development seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
