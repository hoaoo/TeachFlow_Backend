-- Separate classroom ownership from the actual homeroom assignment.
ALTER TABLE "Classroom" ADD COLUMN "homeroomTeacherId" TEXT;


CREATE INDEX "Classroom_homeroomTeacherId_idx"
ON "Classroom"("homeroomTeacherId");

ALTER TABLE "Classroom"
ADD CONSTRAINT "Classroom_homeroomTeacherId_fkey"
FOREIGN KEY ("homeroomTeacherId") REFERENCES "Teacher"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ParentContactLog" ADD COLUMN "followUp" TEXT;
