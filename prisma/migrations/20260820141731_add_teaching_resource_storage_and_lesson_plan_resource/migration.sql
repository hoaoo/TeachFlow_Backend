-- AlterTable
ALTER TABLE "TeachingResource" ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "originalFileName" TEXT,
ADD COLUMN     "size" INTEGER,
ADD COLUMN     "storagePath" TEXT,
ADD COLUMN     "storedFileName" TEXT;

-- CreateTable
CREATE TABLE "LessonPlanResource" (
    "id" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPlanResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonPlanResource_lessonPlanId_resourceId_key" ON "LessonPlanResource"("lessonPlanId", "resourceId");

-- AddForeignKey
ALTER TABLE "LessonPlanResource" ADD CONSTRAINT "LessonPlanResource_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanResource" ADD CONSTRAINT "LessonPlanResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "TeachingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
