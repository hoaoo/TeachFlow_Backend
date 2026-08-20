import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:postgres_secure_password_2026@127.0.0.1:5432/teachflow_db?schema=public&sslmode=disable',
      },
    },
  });
  try {
    const userCount = await prisma.user.count();
    const teacher = await prisma.teacher.findFirst({ include: { user: true } });
    const classrooms = await prisma.classroom.findMany({ select: { name: true, room: true } });
    const studentCount = await prisma.student.count();
    const subjectCount = await prisma.subject.count();
    const planCount = await prisma.lessonPlan.count();
    const taskCount = await prisma.teacherTask.count();
    const attendanceCount = await prisma.attendanceSession.count();
    const assessmentCount = await prisma.assessment.count();

    console.log('--- DATABASE VERIFICATION ---');
    console.log(`Users: ${userCount}`);
    console.log(`Teacher: ${teacher?.fullName} (${teacher?.user?.email})`);
    console.log(`Classrooms (${classrooms.length}):`, classrooms.map(c => `${c.name} (${c.room})`).join(', '));
    console.log(`Students: ${studentCount}`);
    console.log(`Subjects: ${subjectCount}`);
    console.log(`Lesson Plans: ${planCount}`);
    console.log(`Tasks: ${taskCount}`);
    console.log(`Attendance Sessions: ${attendanceCount}`);
    console.log(`Assessments: ${assessmentCount}`);
    console.log('-----------------------------');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
