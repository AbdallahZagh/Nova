CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

ALTER TABLE "project_members"
ADD COLUMN "role" "ProjectRole" NOT NULL DEFAULT 'MEMBER';

INSERT INTO "project_members" ("userId", "projectId", "role")
SELECT "ownerId", "id", 'OWNER'::"ProjectRole"
FROM "projects"
ON CONFLICT ("userId", "projectId")
DO UPDATE SET "role" = 'OWNER'::"ProjectRole";
