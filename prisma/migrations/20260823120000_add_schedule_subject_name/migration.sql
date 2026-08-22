-- Schedule subjects can now be entered as free text. Keep the legacy relation
-- nullable so existing subject links and data remain intact.
ALTER TABLE "Schedule"
ADD COLUMN "subjectName" TEXT;

ALTER TABLE "Schedule"
ALTER COLUMN "subjectId" DROP NOT NULL;

ALTER TABLE "Schedule"
DROP CONSTRAINT IF EXISTS "Schedule_subjectId_fkey";

ALTER TABLE "Schedule"
ADD CONSTRAINT "Schedule_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
