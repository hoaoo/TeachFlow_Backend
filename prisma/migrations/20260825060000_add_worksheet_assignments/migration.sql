CREATE TABLE "WorksheetAssignment" (
  "id" TEXT NOT NULL,
  "worksheetId" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorksheetAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorksheetAssignment_worksheetId_classroomId_key"
  ON "WorksheetAssignment"("worksheetId", "classroomId");

CREATE INDEX "WorksheetAssignment_teacherId_classroomId_idx"
  ON "WorksheetAssignment"("teacherId", "classroomId");

CREATE INDEX "WorksheetAssignment_teacherId_assignedAt_idx"
  ON "WorksheetAssignment"("teacherId", "assignedAt");

ALTER TABLE "WorksheetAssignment"
  ADD CONSTRAINT "WorksheetAssignment_worksheetId_fkey"
  FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorksheetAssignment"
  ADD CONSTRAINT "WorksheetAssignment_classroomId_fkey"
  FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorksheetAssignment"
  ADD CONSTRAINT "WorksheetAssignment_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;