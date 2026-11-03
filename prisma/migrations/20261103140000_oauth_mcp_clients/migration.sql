-- Agent sign-in for the remote MCP server.

CREATE TABLE "oauth_clients" (
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "clientSecretExpiresAt" INTEGER,
    "clientIdIssuedAt" INTEGER NOT NULL,
    "redirectUris" JSONB NOT NULL,
    "tokenEndpointAuthMethod" TEXT,
    "grantTypes" JSONB,
    "responseTypes" JSONB,
    "clientName" TEXT,
    "clientUri" TEXT,
    "logoUri" TEXT,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("clientId")
);

CREATE TABLE "oauth_grants" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "secretHash" TEXT,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "state" TEXT,
    "resource" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'nova',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_grants_secretHash_key" ON "oauth_grants"("secretHash");
CREATE INDEX "oauth_grants_clientId_idx" ON "oauth_grants"("clientId");
CREATE INDEX "oauth_grants_expiresAt_idx" ON "oauth_grants"("expiresAt");

CREATE TABLE "oauth_refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resource" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_refresh_tokens_tokenHash_key" ON "oauth_refresh_tokens"("tokenHash");
CREATE INDEX "oauth_refresh_tokens_clientId_idx" ON "oauth_refresh_tokens"("clientId");

ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
