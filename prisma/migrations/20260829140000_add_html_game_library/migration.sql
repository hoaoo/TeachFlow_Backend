CREATE TYPE "HtmlGameStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISABLED');
CREATE TYPE "HtmlGameQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER');

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
    "supportsQuestionConfig" BOOLEAN NOT NULL DEFAULT false,
    "configSchemaVersion" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HtmlGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HtmlGameQuestion" (
    "id" TEXT NOT NULL,
    "htmlGameId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "type" "HtmlGameQuestionType" NOT NULL,
    "options" JSONB,
    "correctAnswer" JSONB NOT NULL,
    "explanation" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HtmlGameQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeacherHtmlGame" (
    "id" TEXT NOT NULL,
    "htmlGameId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherHtmlGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeacherHtmlGameQuestion" (
    "id" TEXT NOT NULL,
    "teacherHtmlGameId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "type" "HtmlGameQuestionType" NOT NULL,
    "options" JSONB,
    "correctAnswer" JSONB NOT NULL,
    "explanation" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherHtmlGameQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LessonPlanHtmlGame" (
    "id" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "htmlGameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonPlanHtmlGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LessonPlanTeacherHtmlGame" (
    "id" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "teacherHtmlGameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonPlanTeacherHtmlGame_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HtmlGame_status_updatedAt_idx" ON "HtmlGame"("status", "updatedAt");
CREATE INDEX "HtmlGame_gradeId_idx" ON "HtmlGame"("gradeId");
CREATE INDEX "HtmlGame_subjectId_idx" ON "HtmlGame"("subjectId");
CREATE INDEX "HtmlGame_createdById_idx" ON "HtmlGame"("createdById");
CREATE INDEX "HtmlGameQuestion_htmlGameId_idx" ON "HtmlGameQuestion"("htmlGameId");
CREATE UNIQUE INDEX "HtmlGameQuestion_htmlGameId_order_key" ON "HtmlGameQuestion"("htmlGameId", "order");
CREATE INDEX "TeacherHtmlGame_htmlGameId_idx" ON "TeacherHtmlGame"("htmlGameId");
CREATE INDEX "TeacherHtmlGame_teacherId_idx" ON "TeacherHtmlGame"("teacherId");
CREATE UNIQUE INDEX "TeacherHtmlGame_teacherId_htmlGameId_key" ON "TeacherHtmlGame"("teacherId", "htmlGameId");
CREATE INDEX "TeacherHtmlGameQuestion_teacherHtmlGameId_idx" ON "TeacherHtmlGameQuestion"("teacherHtmlGameId");
CREATE UNIQUE INDEX "TeacherHtmlGameQuestion_teacherHtmlGameId_order_key" ON "TeacherHtmlGameQuestion"("teacherHtmlGameId", "order");
CREATE INDEX "LessonPlanHtmlGame_htmlGameId_idx" ON "LessonPlanHtmlGame"("htmlGameId");
CREATE UNIQUE INDEX "LessonPlanHtmlGame_lessonPlanId_htmlGameId_key" ON "LessonPlanHtmlGame"("lessonPlanId", "htmlGameId");
CREATE INDEX "LessonPlanTeacherHtmlGame_teacherHtmlGameId_idx" ON "LessonPlanTeacherHtmlGame"("teacherHtmlGameId");
CREATE UNIQUE INDEX "LessonPlanTeacherHtmlGame_lessonPlanId_teacherHtmlGameId_key" ON "LessonPlanTeacherHtmlGame"("lessonPlanId", "teacherHtmlGameId");

ALTER TABLE "HtmlGame" ADD CONSTRAINT "HtmlGame_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HtmlGame" ADD CONSTRAINT "HtmlGame_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HtmlGame" ADD CONSTRAINT "HtmlGame_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HtmlGameQuestion" ADD CONSTRAINT "HtmlGameQuestion_htmlGameId_fkey" FOREIGN KEY ("htmlGameId") REFERENCES "HtmlGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherHtmlGame" ADD CONSTRAINT "TeacherHtmlGame_htmlGameId_fkey" FOREIGN KEY ("htmlGameId") REFERENCES "HtmlGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherHtmlGame" ADD CONSTRAINT "TeacherHtmlGame_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherHtmlGameQuestion" ADD CONSTRAINT "TeacherHtmlGameQuestion_teacherHtmlGameId_fkey" FOREIGN KEY ("teacherHtmlGameId") REFERENCES "TeacherHtmlGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlanHtmlGame" ADD CONSTRAINT "LessonPlanHtmlGame_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlanHtmlGame" ADD CONSTRAINT "LessonPlanHtmlGame_htmlGameId_fkey" FOREIGN KEY ("htmlGameId") REFERENCES "HtmlGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlanTeacherHtmlGame" ADD CONSTRAINT "LessonPlanTeacherHtmlGame_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlanTeacherHtmlGame" ADD CONSTRAINT "LessonPlanTeacherHtmlGame_teacherHtmlGameId_fkey" FOREIGN KEY ("teacherHtmlGameId") REFERENCES "TeacherHtmlGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
