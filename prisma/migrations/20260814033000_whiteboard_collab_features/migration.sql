CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable
ALTER TABLE "task_comments" ADD COLUMN "mentionedUserIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "task_comments" ADD COLUMN "replyMentionedUserIds" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "project_suggestions" ADD COLUMN "mentionedUserIds" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "whiteboards" ADD COLUMN "lastEditedAt" TIMESTAMP(3);
ALTER TABLE "whiteboards" ADD COLUMN "lastEditedById" TEXT;
ALTER TABLE "whiteboards" ADD COLUMN "duplicatedFromId" TEXT;

UPDATE "whiteboards"
SET "lastEditedAt" = "updatedAt", "lastEditedById" = "createdById"
WHERE "lastEditedAt" IS NULL;

-- CreateTable
CREATE TABLE "whiteboard_activities" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "whiteboardId" TEXT NOT NULL,
    "actorId" TEXT,

    CONSTRAINT "whiteboard_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whiteboard_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pageId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "mentionedUserIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "whiteboardId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "whiteboard_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whiteboard_invites" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "WhiteboardRole" NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "whiteboardId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "usedById" TEXT,

    CONSTRAINT "whiteboard_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whiteboards_lastEditedById_idx" ON "whiteboards"("lastEditedById");
CREATE INDEX "whiteboard_activities_whiteboardId_createdAt_idx" ON "whiteboard_activities"("whiteboardId", "createdAt");
CREATE INDEX "whiteboard_activities_whiteboardId_actorId_type_createdAt_idx" ON "whiteboard_activities"("whiteboardId", "actorId", "type", "createdAt");
CREATE INDEX "whiteboard_comments_whiteboardId_createdAt_idx" ON "whiteboard_comments"("whiteboardId", "createdAt");
CREATE UNIQUE INDEX "whiteboard_invites_token_key" ON "whiteboard_invites"("token");
CREATE INDEX "whiteboard_invites_token_idx" ON "whiteboard_invites"("token");

-- AddForeignKey
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whiteboard_activities" ADD CONSTRAINT "whiteboard_activities_whiteboardId_fkey" FOREIGN KEY ("whiteboardId") REFERENCES "whiteboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_activities" ADD CONSTRAINT "whiteboard_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whiteboard_comments" ADD CONSTRAINT "whiteboard_comments_whiteboardId_fkey" FOREIGN KEY ("whiteboardId") REFERENCES "whiteboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_comments" ADD CONSTRAINT "whiteboard_comments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whiteboard_invites" ADD CONSTRAINT "whiteboard_invites_whiteboardId_fkey" FOREIGN KEY ("whiteboardId") REFERENCES "whiteboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_invites" ADD CONSTRAINT "whiteboard_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_invites" ADD CONSTRAINT "whiteboard_invites_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "whiteboard_activities" ("id", "type", "metadata", "createdAt", "whiteboardId", "actorId")
SELECT gen_random_uuid()::text, 'CREATED', NULL, "createdAt", "id", "createdById"
FROM "whiteboards";
