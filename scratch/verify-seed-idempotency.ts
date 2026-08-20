import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const schoolYears = await prisma.schoolYear.count();
  const grades = await prisma.grade.count();
  const classrooms = await prisma.classroom.count({ where: { deletedAt: null } });
  const students = await prisma.student.count({ where: { deletedAt: null } });

  console.log(`SchoolYears count: ${schoolYears}`);
  console.log(`Grades count: ${grades}`);
  console.log(`Classrooms count: ${classrooms}`);
  console.log(`Students count: ${students}`);

  // Check for any duplicate names in classrooms for the seed teacher
  const teacher = await prisma.teacher.findFirst({
    where: { user: { email: 'teacher@teachflow.vn' } },
  });

  const teacherClasses = await prisma.classroom.findMany({
    where: { teacherId: teacher?.id, deletedAt: null },
  });

  const names = teacherClasses.map((c) => c.name);
  const uniqueNames = new Set(names);
  console.log(`Teacher classrooms: ${names.join(', ')} (Total: ${names.length}, Unique: ${uniqueNames.size})`);

  if (names.length === uniqueNames.size) {
    console.log('✓ SEED IDEMPOTENCY CONFIRMED: 0 DUPLICATES.');
  } else {
    console.error('FAIL: Duplicates found in classrooms!');
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
