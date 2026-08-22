-- Teaching mode is explicit domain configuration.
-- Existing teachers keep subject specialist behavior by default.
CREATE TYPE "TeachingMode" AS ENUM (
    'PRIMARY_GENERALIST',
    'SUBJECT_SPECIALIST'
);

ALTER TABLE "Teacher"
ADD COLUMN "teachingMode" "TeachingMode"
NOT NULL DEFAULT 'SUBJECT_SPECIALIST';

CREATE TABLE "ClassSubject" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSubject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassSubject_classroomId_subjectId_key"
ON "ClassSubject"("classroomId", "subjectId");

CREATE INDEX "ClassSubject_classroomId_isActive_idx"
ON "ClassSubject"("classroomId", "isActive");

CREATE INDEX "ClassSubject_subjectId_idx"
ON "ClassSubject"("subjectId");

ALTER TABLE "ClassSubject"
ADD CONSTRAINT "ClassSubject_classroomId_fkey"
FOREIGN KEY ("classroomId")
REFERENCES "Classroom"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ClassSubject"
ADD CONSTRAINT "ClassSubject_subjectId_fkey"
FOREIGN KEY ("subjectId")
REFERENCES "Subject"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;