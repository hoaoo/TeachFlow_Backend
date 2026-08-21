-- AlterTable
ALTER TABLE "StudentEnrollment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TeachingAssignment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TeachingPlan" ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "startTime" TEXT;

-- CreateIndex
CREATE INDEX "Classroom_schoolYearId_idx" ON "Classroom"("schoolYearId");
