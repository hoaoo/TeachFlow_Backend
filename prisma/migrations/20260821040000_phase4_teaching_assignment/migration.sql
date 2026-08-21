-- CreateTable
CREATE TABLE IF NOT EXISTS "TeachingAssignment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeachingAssignment_teacherId_schoolYearId_isActive_idx" ON "TeachingAssignment"("teacherId", "schoolYearId", "isActive");
CREATE INDEX IF NOT EXISTS "TeachingAssignment_classroomId_schoolYearId_isActive_idx" ON "TeachingAssignment"("classroomId", "schoolYearId", "isActive");
CREATE INDEX IF NOT EXISTS "TeachingAssignment_subjectId_idx" ON "TeachingAssignment"("subjectId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Safe Backfill of TeachingAssignment from distinct TeachingPlan rows
INSERT INTO "TeachingAssignment" (
    "id",
    "teacherId",
    "classroomId",
    "subjectId",
    "schoolYearId",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    tp."teacherId",
    tp."classroomId",
    tp."subjectId",
    tp."schoolYearId",
    true,
    MIN(tp."createdAt"),
    CURRENT_TIMESTAMP
FROM "TeachingPlan" tp
JOIN "Classroom" c ON tp."classroomId" = c."id"
WHERE tp."schoolYearId" = c."schoolYearId"
GROUP BY tp."teacherId", tp."classroomId", tp."subjectId", tp."schoolYearId"
HAVING NOT EXISTS (
    SELECT 1 FROM "TeachingAssignment" ta
    WHERE ta."teacherId" = tp."teacherId"
      AND ta."classroomId" = tp."classroomId"
      AND ta."subjectId" = tp."subjectId"
      AND ta."schoolYearId" = tp."schoolYearId"
);

-- Enforce exactly one active assignment per exact (teacher, classroom, subject, schoolYear)
CREATE UNIQUE INDEX IF NOT EXISTS "TeachingAssignment_teacher_classroom_subject_schoolYear_unique"
ON "TeachingAssignment" ("teacherId", "classroomId", "subjectId", "schoolYearId")
WHERE "isActive" = true;
