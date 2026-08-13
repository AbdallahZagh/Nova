-- CreateEnum
CREATE TYPE "WhiteboardRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateTable
CREATE TABLE "whiteboard_pages" (
    "id" TEXT NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "documentJson" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "whiteboardId" TEXT NOT NULL,

    CONSTRAINT "whiteboard_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whiteboard_page_snapshots" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whiteboard_page_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whiteboard_members" (
    "userId" TEXT NOT NULL,
    "whiteboardId" TEXT NOT NULL,
    "role" "WhiteboardRole" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "whiteboard_members_pkey" PRIMARY KEY ("userId","whiteboardId")
);

-- Migrate existing boards into a first page
INSERT INTO "whiteboard_pages" ("id", "index", "documentJson", "version", "createdAt", "updatedAt", "whiteboardId")
SELECT gen_random_uuid()::text, 0, "documentJson", "version", "createdAt", "updatedAt", "id"
FROM "whiteboards";

-- Move snapshots onto those pages
INSERT INTO "whiteboard_page_snapshots" ("id", "pageId", "imageUrl", "storagePath", "width", "height", "createdAt", "updatedAt")
SELECT s."id", p."id", s."imageUrl", s."storagePath", s."width", s."height", s."createdAt", s."updatedAt"
FROM "whiteboard_snapshots" s
JOIN "whiteboard_pages" p ON p."whiteboardId" = s."whiteboardId";

-- Creator is always an admin
INSERT INTO "whiteboard_members" ("userId", "whiteboardId", "role")
SELECT "createdById", "id", 'ADMIN'::"WhiteboardRole"
FROM "whiteboards";

-- Keep existing project boards visible to current project members
INSERT INTO "whiteboard_members" ("userId", "whiteboardId", "role")
SELECT pm."userId", w."id", 'MEMBER'::"WhiteboardRole"
FROM "whiteboards" w
JOIN "project_members" pm ON pm."projectId" = w."projectId"
WHERE w."projectId" IS NOT NULL
  AND pm."userId" <> w."createdById"
ON CONFLICT ("userId", "whiteboardId") DO NOTHING;

-- CreateIndex
CREATE INDEX "whiteboard_pages_whiteboardId_idx" ON "whiteboard_pages"("whiteboardId");

-- CreateIndex
CREATE UNIQUE INDEX "whiteboard_page_snapshots_pageId_key" ON "whiteboard_page_snapshots"("pageId");

-- AddForeignKey
ALTER TABLE "whiteboard_pages" ADD CONSTRAINT "whiteboard_pages_whiteboardId_fkey" FOREIGN KEY ("whiteboardId") REFERENCES "whiteboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whiteboard_page_snapshots" ADD CONSTRAINT "whiteboard_page_snapshots_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "whiteboard_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whiteboard_members" ADD CONSTRAINT "whiteboard_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whiteboard_members" ADD CONSTRAINT "whiteboard_members_whiteboardId_fkey" FOREIGN KEY ("whiteboardId") REFERENCES "whiteboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old snapshot table and document columns
DROP TABLE "whiteboard_snapshots";

ALTER TABLE "whiteboards" DROP COLUMN "documentJson";
ALTER TABLE "whiteboards" DROP COLUMN "version";
