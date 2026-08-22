-- AlterTable: LessonPlan
ALTER TABLE "LessonPlan" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'NATIVE';
ALTER TABLE "LessonPlan" ADD COLUMN IF NOT EXISTS "originalFileName" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN IF NOT EXISTS "storedFileName" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN IF NOT EXISTS "storagePath" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "LessonPlan" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;

-- AlterTable: TeachingActivity
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "objective" TEXT;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "method" TEXT;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "technique" TEXT;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "competencies" TEXT;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "qualities" TEXT;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "equipment" TEXT;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "teacherActivity" TEXT;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "studentActivity" TEXT;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "gameRules" TEXT;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "questionsJson" JSONB;
ALTER TABLE "TeachingActivity" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: TeachingActivity
CREATE INDEX IF NOT EXISTS "TeachingActivity_teacherId_deletedAt_idx" ON "TeachingActivity"("teacherId", "deletedAt");
CREATE INDEX IF NOT EXISTS "TeachingActivity_typeName_idx" ON "TeachingActivity"("typeName");
CREATE INDEX IF NOT EXISTS "TeachingActivity_subjectName_idx" ON "TeachingActivity"("subjectName");
CREATE INDEX IF NOT EXISTS "TeachingActivity_gradeName_idx" ON "TeachingActivity"("gradeName");
