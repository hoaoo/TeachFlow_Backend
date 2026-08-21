-- Step 1: Add columns as nullable / with defaults
ALTER TABLE "Classroom" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Classroom" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Step 2: Backfill code for existing Classroom records
UPDATE "Classroom"
SET "code" = UPPER(TRIM(REPLACE(REPLACE("name", 'Lớp ', ''), 'lớp ', '')))
WHERE "code" IS NULL OR "code" = '';

-- Step 3: Handle duplicate codes within same schoolYear if any
WITH duplicates AS (
  SELECT id, "schoolYearId", "code",
         ROW_NUMBER() OVER (PARTITION BY "schoolYearId", "code" ORDER BY "createdAt") as rn
  FROM "Classroom"
)
UPDATE "Classroom" c
SET "code" = c."code" || '-' || d.rn
FROM duplicates d
WHERE c.id = d.id AND d.rn > 1;

-- Step 4: Ensure all codes are non-empty and set NOT NULL
UPDATE "Classroom"
SET "code" = 'CLASS-' || SUBSTRING(id, 1, 8)
WHERE "code" IS NULL OR "code" = '';

ALTER TABLE "Classroom" ALTER COLUMN "code" SET NOT NULL;

-- Step 5: Create Unique and Index constraints for Classroom
CREATE UNIQUE INDEX IF NOT EXISTS "Classroom_schoolYearId_code_key" ON "Classroom"("schoolYearId", "code");
CREATE INDEX IF NOT EXISTS "Classroom_gradeId_idx" ON "Classroom"("gradeId");
CREATE INDEX IF NOT EXISTS "Classroom_teacherId_idx" ON "Classroom"("teacherId");

-- Step 6: Create partial unique index on SchoolYear.isCurrent (DB-level concurrency safety)
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolYear_isCurrent_unique" ON "SchoolYear" ("isCurrent") WHERE "isCurrent" = true;
