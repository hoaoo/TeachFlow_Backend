-- Normalize legacy nullable/blank periods without deleting attendance data.
WITH normalized AS (
  SELECT
    "id",
    COALESCE(NULLIF(TRIM("sessionPeriod"), ''), 'MORNING') AS normalized_period,
    ROW_NUMBER() OVER (
      PARTITION BY "classroomId", "attendanceDate",
        COALESCE(NULLIF(TRIM("sessionPeriod"), ''), 'MORNING')
      ORDER BY "createdAt", "id"
    ) AS duplicate_rank
  FROM "AttendanceSession"
)
UPDATE "AttendanceSession" a
SET "sessionPeriod" =
  CASE
    WHEN n.duplicate_rank = 1 THEN n.normalized_period
    ELSE n.normalized_period || '-' || SUBSTRING(a."id", 1, 8)
  END
FROM normalized n
WHERE a."id" = n."id";

ALTER TABLE "AttendanceSession"
  ALTER COLUMN "sessionPeriod" SET DEFAULT 'MORNING',
  ALTER COLUMN "sessionPeriod" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceSession_classroomId_attendanceDate_sessionPeriod_key"
ON "AttendanceSession" ("classroomId", "attendanceDate", "sessionPeriod");