-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'COMPLETED', 'WITHDRAWN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StudentEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "transferReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentEnrollment_studentId_idx" ON "StudentEnrollment"("studentId");
CREATE INDEX IF NOT EXISTS "StudentEnrollment_classroomId_status_idx" ON "StudentEnrollment"("classroomId", "status");
CREATE INDEX IF NOT EXISTS "StudentEnrollment_schoolYearId_classroomId_status_idx" ON "StudentEnrollment"("schoolYearId", "classroomId", "status");
CREATE INDEX IF NOT EXISTS "StudentEnrollment_studentId_schoolYearId_idx" ON "StudentEnrollment"("studentId", "schoolYearId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Safe Backfill of legacy ClassStudent records into StudentEnrollment
INSERT INTO "StudentEnrollment" (
    "id",
    "studentId",
    "schoolYearId",
    "classroomId",
    "status",
    "enrolledAt",
    "leftAt",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    cs."studentId",
    c."schoolYearId",
    cs."classroomId",
    CASE
        WHEN cs."status" = 'INACTIVE' THEN 'TRANSFERRED'::"EnrollmentStatus"
        ELSE 'ACTIVE'::"EnrollmentStatus"
    END,
    cs."joinedAt",
    cs."leftAt",
    cs."createdAt",
    cs."updatedAt"
FROM "ClassStudent" cs
JOIN "Classroom" c ON cs."classroomId" = c."id"
WHERE NOT EXISTS (
    SELECT 1 FROM "StudentEnrollment" se
    WHERE se."studentId" = cs."studentId"
      AND se."classroomId" = cs."classroomId"
      AND se."schoolYearId" = c."schoolYearId"
);

-- Enforce exactly one ACTIVE enrollment per student per school year at PostgreSQL level
CREATE UNIQUE INDEX IF NOT EXISTS "StudentEnrollment_active_student_schoolYear_unique"
ON "StudentEnrollment" ("studentId", "schoolYearId")
WHERE "status" = 'ACTIVE';
