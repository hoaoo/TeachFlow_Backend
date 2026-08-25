ALTER TABLE "WorksheetAssignment" ADD COLUMN "note" TEXT;

CREATE TABLE "SeatingPlan" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rows" INTEGER NOT NULL,
  "columns" INTEGER NOT NULL,
  "layout" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeatingPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SeatingPlan_teacherId_classroomId_name_key" ON "SeatingPlan"("teacherId", "classroomId", "name");
CREATE INDEX "SeatingPlan_teacherId_classroomId_idx" ON "SeatingPlan"("teacherId", "classroomId");
ALTER TABLE "SeatingPlan" ADD CONSTRAINT "SeatingPlan_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatingPlan" ADD CONSTRAINT "SeatingPlan_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeacherTemplate" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeacherTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TeacherTemplate_teacherId_type_updatedAt_idx" ON "TeacherTemplate"("teacherId", "type", "updatedAt");
ALTER TABLE "TeacherTemplate" ADD CONSTRAINT "TeacherTemplate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;