-- Extend the existing homeroom records without invalidating historical data.
CREATE TYPE "ParentContactMethod" AS ENUM ('PHONE', 'IN_PERSON', 'MESSAGE', 'OTHER');

ALTER TABLE "Student"
ADD COLUMN "parentEmail" TEXT;

ALTER TABLE "StudentBehaviorRecord"
ADD COLUMN "behaviorType" TEXT,
ADD COLUMN "resolution" TEXT,
ADD COLUMN "note" TEXT;

ALTER TABLE "WeeklyClassReview"
ADD COLUMN "notableStudents" TEXT,
ADD COLUMN "supportStudents" TEXT,
ADD COLUMN "studentComments" JSONB;

ALTER TABLE "MonthlyClassReview"
ADD COLUMN "generalComment" TEXT,
ADD COLUMN "difficulties" TEXT,
ADD COLUMN "measures" TEXT,
ADD COLUMN "classActivities" TEXT,
ADD COLUMN "summarySnapshot" JSONB;

ALTER TABLE "TeacherTask"
ADD COLUMN "classroomId" TEXT;

CREATE INDEX "TeacherTask_classroomId_status_idx"
ON "TeacherTask"("classroomId", "status");

ALTER TABLE "TeacherTask"
ADD CONSTRAINT "TeacherTask_classroomId_fkey"
FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ParentContactLog" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "contactDate" DATE NOT NULL,
    "guardianName" TEXT,
    "relationship" TEXT,
    "method" "ParentContactMethod" NOT NULL,
    "content" TEXT NOT NULL,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParentContactLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParentContactLog_classroomId_contactDate_idx"
ON "ParentContactLog"("classroomId", "contactDate");
CREATE INDEX "ParentContactLog_studentId_contactDate_idx"
ON "ParentContactLog"("studentId", "contactDate");
CREATE INDEX "ParentContactLog_teacherId_createdAt_idx"
ON "ParentContactLog"("teacherId", "createdAt");

ALTER TABLE "ParentContactLog"
ADD CONSTRAINT "ParentContactLog_classroomId_fkey"
FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentContactLog"
ADD CONSTRAINT "ParentContactLog_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentContactLog"
ADD CONSTRAINT "ParentContactLog_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
