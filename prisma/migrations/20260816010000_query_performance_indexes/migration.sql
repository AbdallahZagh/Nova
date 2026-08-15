-- Query-path indexes: list-by-project, my-tasks, due dates, nested includes.

CREATE INDEX IF NOT EXISTS "projects_ownerId_idx" ON "projects"("ownerId");
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects"("status");

CREATE INDEX IF NOT EXISTS "project_suggestions_projectId_idx" ON "project_suggestions"("projectId");

CREATE INDEX IF NOT EXISTS "tasks_projectId_idx" ON "tasks"("projectId");
CREATE INDEX IF NOT EXISTS "tasks_assigneeId_idx" ON "tasks"("assigneeId");
CREATE INDEX IF NOT EXISTS "tasks_dueDate_idx" ON "tasks"("dueDate");
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks"("status");
CREATE INDEX IF NOT EXISTS "tasks_projectId_status_idx" ON "tasks"("projectId", "status");

CREATE INDEX IF NOT EXISTS "task_assignments_userId_idx" ON "task_assignments"("userId");

CREATE INDEX IF NOT EXISTS "task_comments_taskId_idx" ON "task_comments"("taskId");

CREATE INDEX IF NOT EXISTS "subtasks_taskId_idx" ON "subtasks"("taskId");

CREATE INDEX IF NOT EXISTS "task_activities_taskId_idx" ON "task_activities"("taskId");
