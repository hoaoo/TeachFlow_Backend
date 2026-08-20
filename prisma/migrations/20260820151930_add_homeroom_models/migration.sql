-- CreateEnum
CREATE TYPE "BehaviorCategory" AS ENUM ('DISCIPLINE', 'LEARNING', 'HYGIENE', 'TEAMWORK', 'RESPONSIBILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "BehaviorLevel" AS ENUM ('POSITIVE', 'REMINDER', 'NEEDS_ATTENTION');

-- CreateTable
CREATE TABLE "StudentBehaviorRecord" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "category" "BehaviorCategory" NOT NULL,
    "level" "BehaviorLevel" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentBehaviorRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyClassReview" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "strengths" TEXT,
    "limitations" TEXT,
    "nextWeekPlan" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyClassReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyClassReview" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "highlights" TEXT,
    "limitations" TEXT,
    "nextMonthPlan" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyClassReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentBehaviorRecord_classroomId_recordDate_idx" ON "StudentBehaviorRecord"("classroomId", "recordDate");

-- CreateIndex
CREATE INDEX "StudentBehaviorRecord_studentId_idx" ON "StudentBehaviorRecord"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyClassReview_classroomId_schoolYearId_weekNumber_key" ON "WeeklyClassReview"("classroomId", "schoolYearId", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyClassReview_classroomId_year_month_key" ON "MonthlyClassReview"("classroomId", "year", "month");

-- AddForeignKey
ALTER TABLE "StudentBehaviorRecord" ADD CONSTRAINT "StudentBehaviorRecord_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBehaviorRecord" ADD CONSTRAINT "StudentBehaviorRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBehaviorRecord" ADD CONSTRAINT "StudentBehaviorRecord_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyClassReview" ADD CONSTRAINT "WeeklyClassReview_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyClassReview" ADD CONSTRAINT "WeeklyClassReview_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyClassReview" ADD CONSTRAINT "WeeklyClassReview_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyClassReview" ADD CONSTRAINT "MonthlyClassReview_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyClassReview" ADD CONSTRAINT "MonthlyClassReview_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyClassReview" ADD CONSTRAINT "MonthlyClassReview_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
