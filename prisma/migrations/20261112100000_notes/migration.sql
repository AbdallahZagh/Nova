CREATE TYPE "NoteColor" AS ENUM ('SLATE', 'AMBER', 'CORAL', 'SAGE', 'SKY', 'VIOLET');

CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" VARCHAR(160),
    "body" TEXT NOT NULL DEFAULT '',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "color" "NoteColor" NOT NULL DEFAULT 'SLATE',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "floating" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notes_userId_pinned_updatedAt_idx" ON "notes"("userId", "pinned", "updatedAt");
CREATE INDEX "notes_userId_projectId_updatedAt_idx" ON "notes"("userId", "projectId", "updatedAt");

ALTER TABLE "notes" ADD CONSTRAINT "notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
