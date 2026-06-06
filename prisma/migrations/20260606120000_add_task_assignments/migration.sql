CREATE TABLE "task_assignments" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("taskId", "userId")
);

ALTER TABLE "task_assignments"
ADD CONSTRAINT "task_assignments_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_assignments"
ADD CONSTRAINT "task_assignments_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "task_assignments" ("taskId", "userId")
SELECT "id", "assigneeId"
FROM "tasks"
WHERE "assigneeId" IS NOT NULL
ON CONFLICT ("taskId", "userId") DO NOTHING;
