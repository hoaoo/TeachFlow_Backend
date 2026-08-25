-- Class identity is private to a teacher and school year.
DROP INDEX IF EXISTS "Classroom_schoolYearId_code_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Classroom_teacherId_schoolYearId_code_key"
ON "Classroom" ("teacherId", "schoolYearId", "code");

CREATE INDEX IF NOT EXISTS "Classroom_teacherId_schoolYearId_idx"
ON "Classroom" ("teacherId", "schoolYearId");
