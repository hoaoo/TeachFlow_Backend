-- AlterTable: AttendanceSession
ALTER TABLE "AttendanceSession" ADD COLUMN IF NOT EXISTS "scheduleId" TEXT;
ALTER TABLE "AttendanceSession" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "AttendanceSession" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "AttendanceSession" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- Drop old unique constraint on [classroomId, attendanceDate] if it exists
ALTER TABLE "AttendanceSession" DROP CONSTRAINT IF EXISTS "AttendanceSession_classroomId_attendanceDate_key";

-- Add ForeignKey and Unique on scheduleId
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceSession_scheduleId_key'
  ) THEN
    ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_scheduleId_key" UNIQUE ("scheduleId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceSession_scheduleId_fkey'
  ) THEN
    ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Create Indexes on AttendanceSession
CREATE INDEX IF NOT EXISTS "AttendanceSession_scheduleId_idx" ON "AttendanceSession"("scheduleId");
CREATE INDEX IF NOT EXISTS "AttendanceSession_classroomId_attendanceDate_idx" ON "AttendanceSession"("classroomId", "attendanceDate");
CREATE INDEX IF NOT EXISTS "AttendanceSession_teacherId_attendanceDate_idx" ON "AttendanceSession"("teacherId", "attendanceDate");

-- AlterTable: StudentAttendance
ALTER TABLE "StudentAttendance" ADD COLUMN IF NOT EXISTS "lateMinutes" INTEGER DEFAULT 0;

-- Create Indexes on StudentAttendance
CREATE INDEX IF NOT EXISTS "StudentAttendance_studentId_status_idx" ON "StudentAttendance"("studentId", "status");
CREATE INDEX IF NOT EXISTS "StudentAttendance_attendanceSessionId_idx" ON "StudentAttendance"("attendanceSessionId");
