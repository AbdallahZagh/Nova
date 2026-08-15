CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "projects_name_trgm_idx"
  ON "projects" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "tasks_title_trgm_idx"
  ON "tasks" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_fullName_trgm_idx"
  ON "users" USING gin ("fullName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_email_trgm_idx"
  ON "users" USING gin ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_username_trgm_idx"
  ON "users" USING gin ("username" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "whiteboards_title_trgm_idx"
  ON "whiteboards" USING gin ("title" gin_trgm_ops);
