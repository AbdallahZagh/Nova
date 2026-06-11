ALTER TABLE "notification" ADD COLUMN "metadata" JSONB;

CREATE TABLE "user_device_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "user_device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_device_tokens_token_key" ON "user_device_tokens"("token");

CREATE INDEX "user_device_tokens_userId_isActive_idx" ON "user_device_tokens"("userId", "isActive");

ALTER TABLE "user_device_tokens" ADD CONSTRAINT "user_device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
