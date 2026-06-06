CREATE TYPE "TaskCommentStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "TaskCommentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "replyContent" TEXT,
    "repliedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "taskId" TEXT NOT NULL,
    "createdById" TEXT,
    "repliedById" TEXT,
    "closedById" TEXT,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_comments"
ADD CONSTRAINT "task_comments_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_comments"
ADD CONSTRAINT "task_comments_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_comments"
ADD CONSTRAINT "task_comments_repliedById_fkey"
FOREIGN KEY ("repliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_comments"
ADD CONSTRAINT "task_comments_closedById_fkey"
FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
