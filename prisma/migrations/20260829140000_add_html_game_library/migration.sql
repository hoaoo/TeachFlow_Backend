CREATE TYPE "HtmlGameStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISABLED');

CREATE TABLE "HtmlGame" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" JSONB,
    "gradeId" TEXT,
    "subjectId" TEXT,
    "storagePrefix" TEXT NOT NULL,
    "entryFile" TEXT NOT NULL DEFAULT 'index.html',
    "status" "HtmlGameStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HtmlGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LessonPlanHtmlGame" (
    "id" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "htmlGameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonPlanHtmlGame_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HtmlGame_status_updatedAt_idx" ON "HtmlGame"("status", "updatedAt");
CREATE INDEX "HtmlGame_gradeId_idx" ON "HtmlGame"("gradeId");
CREATE INDEX "HtmlGame_subjectId_idx" ON "HtmlGame"("subjectId");
CREATE INDEX "HtmlGame_createdById_idx" ON "HtmlGame"("createdById");
CREATE INDEX "LessonPlanHtmlGame_htmlGameId_idx" ON "LessonPlanHtmlGame"("htmlGameId");
CREATE UNIQUE INDEX "LessonPlanHtmlGame_lessonPlanId_htmlGameId_key" ON "LessonPlanHtmlGame"("lessonPlanId", "htmlGameId");

ALTER TABLE "HtmlGame" ADD CONSTRAINT "HtmlGame_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HtmlGame" ADD CONSTRAINT "HtmlGame_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HtmlGame" ADD CONSTRAINT "HtmlGame_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonPlanHtmlGame" ADD CONSTRAINT "LessonPlanHtmlGame_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlanHtmlGame" ADD CONSTRAINT "LessonPlanHtmlGame_htmlGameId_fkey" FOREIGN KEY ("htmlGameId") REFERENCES "HtmlGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
