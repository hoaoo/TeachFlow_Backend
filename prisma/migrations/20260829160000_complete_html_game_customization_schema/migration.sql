-- Complete the HTML game schema for databases that applied the original
-- 20260829140000 migration before question customization was added to it.
-- Every statement is additive/idempotent so a fresh database that applies the
-- current historical migration remains valid.

DO $$
BEGIN
    CREATE TYPE "HtmlGameQuestionType" AS ENUM (
        'SINGLE_CHOICE',
        'MULTIPLE_CHOICE',
        'TRUE_FALSE',
        'SHORT_ANSWER'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "HtmlGame"
ADD COLUMN IF NOT EXISTS "configSchemaVersion" INTEGER;

CREATE TABLE IF NOT EXISTS "HtmlGameQuestion" (
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
    CONSTRAINT "HtmlGameQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HtmlGameQuestion_htmlGameId_fkey"
        FOREIGN KEY ("htmlGameId") REFERENCES "HtmlGame"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TeacherHtmlGame" (
    "id" TEXT NOT NULL,
    "htmlGameId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherHtmlGame_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TeacherHtmlGame_htmlGameId_fkey"
        FOREIGN KEY ("htmlGameId") REFERENCES "HtmlGame"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherHtmlGame_teacherId_fkey"
        FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TeacherHtmlGameQuestion" (
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
    CONSTRAINT "TeacherHtmlGameQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TeacherHtmlGameQuestion_teacherHtmlGameId_fkey"
        FOREIGN KEY ("teacherHtmlGameId") REFERENCES "TeacherHtmlGame"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "LessonPlanTeacherHtmlGame" (
    "id" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "teacherHtmlGameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonPlanTeacherHtmlGame_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LessonPlanTeacherHtmlGame_lessonPlanId_fkey"
        FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonPlanTeacherHtmlGame_teacherHtmlGameId_fkey"
        FOREIGN KEY ("teacherHtmlGameId") REFERENCES "TeacherHtmlGame"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "HtmlGameQuestion_htmlGameId_idx"
ON "HtmlGameQuestion"("htmlGameId");

CREATE UNIQUE INDEX IF NOT EXISTS "HtmlGameQuestion_htmlGameId_order_key"
ON "HtmlGameQuestion"("htmlGameId", "order");

CREATE INDEX IF NOT EXISTS "TeacherHtmlGame_htmlGameId_idx"
ON "TeacherHtmlGame"("htmlGameId");

CREATE INDEX IF NOT EXISTS "TeacherHtmlGame_teacherId_idx"
ON "TeacherHtmlGame"("teacherId");

CREATE UNIQUE INDEX IF NOT EXISTS "TeacherHtmlGame_teacherId_htmlGameId_key"
ON "TeacherHtmlGame"("teacherId", "htmlGameId");

CREATE INDEX IF NOT EXISTS "TeacherHtmlGameQuestion_teacherHtmlGameId_idx"
ON "TeacherHtmlGameQuestion"("teacherHtmlGameId");

CREATE UNIQUE INDEX IF NOT EXISTS "TeacherHtmlGameQuestion_teacherHtmlGameId_order_key"
ON "TeacherHtmlGameQuestion"("teacherHtmlGameId", "order");

CREATE INDEX IF NOT EXISTS "LessonPlanTeacherHtmlGame_teacherHtmlGameId_idx"
ON "LessonPlanTeacherHtmlGame"("teacherHtmlGameId");

CREATE UNIQUE INDEX IF NOT EXISTS "LessonPlanTeacherHtmlGame_lessonPlanId_teacherHtmlGameId_key"
ON "LessonPlanTeacherHtmlGame"("lessonPlanId", "teacherHtmlGameId");
