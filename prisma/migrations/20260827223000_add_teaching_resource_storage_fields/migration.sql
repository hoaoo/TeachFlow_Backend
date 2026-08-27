-- AlterTable: TeachingResource
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "originalFileName" TEXT;
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "storedFileName" TEXT;
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "storagePath" TEXT;
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "size" INTEGER;
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "previewStatus" TEXT DEFAULT 'NONE';
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "previewStorageKey" TEXT;
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "previewMimeType" TEXT;
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "previewGeneratedAt" TIMESTAMP(3);
ALTER TABLE "TeachingResource" ADD COLUMN IF NOT EXISTS "previewError" TEXT;

-- CreateTable: LessonPlanResource
CREATE TABLE IF NOT EXISTS "LessonPlanResource" (
    "id" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPlanResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LessonPlanResource_lessonPlanId_resourceId_key" ON "LessonPlanResource"("lessonPlanId", "resourceId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlanResource_lessonPlanId_fkey') THEN
        ALTER TABLE "LessonPlanResource" ADD CONSTRAINT "LessonPlanResource_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonPlanResource_resourceId_fkey') THEN
        ALTER TABLE "LessonPlanResource" ADD CONSTRAINT "LessonPlanResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "TeachingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
