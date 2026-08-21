-- AlterTable LessonPlan
ALTER TABLE "LessonPlan" ADD COLUMN IF NOT EXISTS "teachingAssignmentId" TEXT;

-- AlterTable AttendanceSession
ALTER TABLE "AttendanceSession" ADD COLUMN IF NOT EXISTS "teachingAssignmentId" TEXT;

-- AlterTable Assessment
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "teachingAssignmentId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LessonPlan_teachingAssignmentId_idx" ON "LessonPlan"("teachingAssignmentId");
CREATE INDEX IF NOT EXISTS "AttendanceSession_teachingAssignmentId_idx" ON "AttendanceSession"("teachingAssignmentId");
CREATE INDEX IF NOT EXISTS "Assessment_teachingAssignmentId_idx" ON "Assessment"("teachingAssignmentId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Deterministic Backfill: LessonPlan -> TeachingAssignment
UPDATE "LessonPlan" lp
SET "teachingAssignmentId" = ta."id"
FROM "TeachingAssignment" ta
JOIN "Classroom" c ON ta."classroomId" = c."id"
WHERE lp."teachingAssignmentId" IS NULL
  AND lp."teacherId" = ta."teacherId"
  AND lp."classroomId" = ta."classroomId"
  AND (
      (lp."subjectId" IS NOT NULL AND lp."subjectId" = ta."subjectId")
      OR
      (lp."subjectId" IS NULL AND (
          SELECT COUNT(*) FROM "TeachingAssignment" ta2
          WHERE ta2."teacherId" = lp."teacherId" AND ta2."classroomId" = lp."classroomId" AND ta2."isActive" = true
      ) = 1)
  )
  AND ta."isActive" = true;

-- Deterministic Backfill: Assessment -> TeachingAssignment
UPDATE "Assessment" a
SET "teachingAssignmentId" = ta."id"
FROM "TeachingAssignment" ta
WHERE a."teachingAssignmentId" IS NULL
  AND a."teacherId" = ta."teacherId"
  AND a."classroomId" = ta."classroomId"
  AND (a."subjectId" IS NULL OR a."subjectId" = ta."subjectId")
  AND (a."schoolYearId" IS NULL OR a."schoolYearId" = ta."schoolYearId")
  AND ta."isActive" = true;

-- Deterministic Backfill: AttendanceSession -> TeachingAssignment
UPDATE "AttendanceSession" att
SET "teachingAssignmentId" = ta."id"
FROM "TeachingAssignment" ta
WHERE att."teachingAssignmentId" IS NULL
  AND att."teacherId" = ta."teacherId"
  AND att."classroomId" = ta."classroomId"
  AND ta."isActive" = true
  AND (
      SELECT COUNT(*) FROM "TeachingAssignment" ta2
      WHERE ta2."teacherId" = att."teacherId" AND ta2."classroomId" = att."classroomId" AND ta2."isActive" = true
  ) = 1;
