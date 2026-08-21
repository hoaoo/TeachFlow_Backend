-- AlterTable AdminAuditLog
ALTER TABLE "AdminAuditLog" ALTER COLUMN "targetUserId" DROP NOT NULL;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "actorEmail" TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "resourceType" TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "resourceId" TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'SUCCESS';
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;

-- CreateEnum NotificationType
CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT', 'ENROLLMENT', 'TASK', 'ASSESSMENT', 'HOMEROOM', 'SYSTEM');

-- CreateTable Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
CREATE INDEX "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");
CREATE INDEX "AdminAuditLog_resourceType_resourceId_idx" ON "AdminAuditLog"("resourceType", "resourceId");
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
