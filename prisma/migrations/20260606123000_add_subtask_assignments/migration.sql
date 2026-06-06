CREATE TABLE "subtask_assignments" (
    "subtaskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subtask_assignments_pkey" PRIMARY KEY ("subtaskId", "userId")
);

ALTER TABLE "subtask_assignments"
ADD CONSTRAINT "subtask_assignments_subtaskId_fkey"
FOREIGN KEY ("subtaskId") REFERENCES "subtasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subtask_assignments"
ADD CONSTRAINT "subtask_assignments_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
