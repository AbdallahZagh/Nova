import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';

export const OAUTH_SCOPE = 'nova';
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
export const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const REQUEST_TTL_MS = 1000 * 60 * 10;
export const CODE_TTL_MS = 1000 * 60 * 5;

export function frontendOrigin() {
  return (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

export function mcpIssuerUrl() {
  const raw = process.env.MCP_ISSUER_URL ?? 'http://localhost:8000';
  return new URL(raw.endsWith('/') ? raw : `${raw}/`);
}

export function mcpResourceUrl() {
  return new URL('/mcp', mcpIssuerUrl());
}

export function mcpResourceMetadataUrl() {
  return getOAuthProtectedResourceMetadataUrl(mcpResourceUrl());
}

export function wwwAuthenticate(description: string) {
  const message = description.replace(/"/g, "'");
  return `Bearer error="invalid_token", error_description="${message}", resource_metadata="${mcpResourceMetadataUrl()}"`;
}
