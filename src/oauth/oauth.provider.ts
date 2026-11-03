import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidGrantError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { randomToken, sha256 } from './oauth.crypto';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  CODE_TTL_MS,
  frontendOrigin,
  mcpResourceUrl,
  OAUTH_SCOPE,
  REFRESH_TOKEN_TTL_MS,
  REQUEST_TTL_MS,
} from './oauth.urls';

type ClientRow = {
  clientId: string;
  clientSecret: string | null;
  clientSecretExpiresAt: number | null;
  clientIdIssuedAt: number;
  redirectUris: unknown;
  tokenEndpointAuthMethod: string | null;
  grantTypes: unknown;
  responseTypes: unknown;
  clientName: string | null;
  clientUri: string | null;
  logoUri: string | null;
  scope: string | null;
};

type GrantRow = {
  id: string;
  kind: string;
  secretHash: string | null;
  clientId: string;
  userId: string | null;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string | null;
  scope: string;
  expiresAt: Date;
  usedAt: Date | null;
};

type OAuthStore = {
  oAuthClient: {
    findUnique(args: {
      where: { clientId: string };
    }): Promise<ClientRow | null>;
    create(args: { data: object }): Promise<unknown>;
  };
  oAuthGrant: {
    create(args: { data: object }): Promise<GrantRow>;
    findUnique(args: {
      where: { id: string } | { secretHash: string };
    }): Promise<GrantRow | null>;
    update(args: { where: { id: string }; data: object }): Promise<unknown>;
  };
  oAuthRefreshToken: {
    findUnique(args: { where: { tokenHash: string } }): Promise<{
      id: string;
      clientId: string;
      userId: string;
      scope: string;
      resource: string | null;
      expiresAt: Date;
      revokedAt: Date | null;
    } | null>;
    update(args: { where: { id: string }; data: object }): Promise<unknown>;
    updateMany(args: { where: object; data: object }): Promise<unknown>;
    create(args: { data: object }): Promise<unknown>;
  };
  user: {
    findUnique(args: { where: { id: string }; select: object }): Promise<{
      id: string;
      email: string;
      isActive: boolean;
      isArchived: boolean;
      isDemo: boolean;
      role: UserRole;
      tokensValidAfter: Date | null;
    } | null>;
  };
};

@Injectable()
export class NovaOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  private readonly db: OAuthStore;

  constructor(
    prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {
    this.db = prisma as unknown as OAuthStore;
    this.clientsStore = {
      getClient: (clientId) => this.getClient(clientId),
      registerClient: (client) => this.registerClient(client),
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ) {
    const request = await this.createRequest(client.client_id, params);
    const url = new URL('/connect', frontendOrigin());
    url.searchParams.set('request', request.id);
    res.redirect(url.toString());
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ) {
    const grant = await this.findCode(client.client_id, authorizationCode);
    return grant.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ) {
    const grant = await this.findCode(client.client_id, authorizationCode);
    if (!grant.userId)
      throw new InvalidGrantError('Authorization is incomplete');

    await this.db.oAuthGrant.update({
      where: { id: grant.id },
      data: { usedAt: new Date() },
    });

    return this.issueTokens({
      userId: grant.userId,
      clientId: client.client_id,
      scope: grant.scope,
      resource: grant.resource,
    });
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
  ) {
    const row = await this.db.oAuthRefreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (
      !row ||
      row.clientId !== client.client_id ||
      row.revokedAt ||
      row.expiresAt < new Date()
    ) {
      throw new InvalidGrantError('Refresh token is invalid');
    }

    await this.db.oAuthRefreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens({
      userId: row.userId,
      clientId: row.clientId,
      scope: row.scope,
      resource: row.resource,
    });
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let payload: {
      sub?: string;
      email?: string;
      cid?: string;
      scope?: string;
      resource?: string;
      exp?: number;
      iat?: number;
    };
    try {
      payload = this.jwt.verify<{
        sub?: string;
        email?: string;
        cid?: string;
        scope?: string;
        resource?: string;
        exp?: number;
        iat?: number;
      }>(token);
    } catch {
      throw new InvalidTokenError('Access token is invalid or expired');
    }

    if (!payload.sub || typeof payload.exp !== 'number') {
      throw new InvalidTokenError('Access token is invalid or expired');
    }

    const resource = payload.resource
      ? new URL(payload.resource)
      : mcpResourceUrl();
    if (payload.resource && payload.resource !== mcpResourceUrl().href) {
      throw new InvalidTokenError('Token was not issued for this resource');
    }

    const user = await this.loadActiveUser(payload.sub);
    if (
      user.tokensValidAfter &&
      typeof payload.iat === 'number' &&
      payload.iat < Math.floor(user.tokensValidAfter.getTime() / 1000)
    ) {
      throw new InvalidTokenError('Session expired');
    }
    return {
      token,
      clientId: payload.cid ?? 'nova-app',
      scopes: (payload.scope ?? OAUTH_SCOPE).split(' ').filter(Boolean),
      expiresAt: payload.exp,
      resource,
      extra: {
        userId: user.id,
        email: user.email,
        isDemo: user.isDemo,
        role: user.role,
      },
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: { token: string },
  ) {
    const tokenHash = sha256(request.token);
    await this.db.oAuthRefreshToken.updateMany({
      where: { tokenHash, clientId: client.client_id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async describeRequest(id: string) {
    const grant = await this.findOpenRequest(id);
    const client = await this.getClientRow(grant.clientId);
    let redirectHost = grant.redirectUri;
    try {
      redirectHost = new URL(grant.redirectUri).host;
    } catch {
      redirectHost = grant.redirectUri;
    }
    return {
      clientName: client?.clientName || 'An agent',
      redirectHost,
      scope: grant.scope,
      expiresAt: grant.expiresAt,
    };
  }

  async approveRequest(id: string, user: AuthUser) {
    const grant = await this.findOpenRequest(id);
    const code = randomToken();
    await this.db.oAuthGrant.update({
      where: { id: grant.id },
      data: {
        kind: 'code',
        secretHash: sha256(code),
        userId: user.id,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    return { redirectTo: this.callbackUrl(grant, { code }) };
  }

  async denyRequest(id: string) {
    const grant = await this.findOpenRequest(id);
    await this.db.oAuthGrant.update({
      where: { id: grant.id },
      data: { usedAt: new Date() },
    });
    return {
      redirectTo: this.callbackUrl(grant, { error: 'access_denied' }),
    };
  }

  userFromAuth(auth: AuthInfo): AuthUser {
    const extra = auth.extra ?? {};
    return {
      id: typeof extra.userId === 'string' ? extra.userId : '',
      email: typeof extra.email === 'string' ? extra.email : '',
      isDemo: extra.isDemo === true,
      role:
        extra.role === UserRole.SUPER_ADMIN
          ? UserRole.SUPER_ADMIN
          : UserRole.USER,
    };
  }

  private async createRequest(clientId: string, params: AuthorizationParams) {
    return this.db.oAuthGrant.create({
      data: {
        kind: 'request',
        clientId,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state,
        resource: params.resource?.href ?? mcpResourceUrl().href,
        scope: OAUTH_SCOPE,
        expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
      },
    });
  }

  private async findOpenRequest(id: string): Promise<GrantRow> {
    const grant = await this.db.oAuthGrant.findUnique({
      where: { id },
    });
    if (!grant || grant.kind !== 'request' || grant.usedAt) {
      throw new NotFoundException('This connection request is no longer valid');
    }
    if (grant.expiresAt < new Date()) {
      throw new NotFoundException('This connection request has expired');
    }
    return grant;
  }

  private async findCode(clientId: string, code: string): Promise<GrantRow> {
    const grant = await this.db.oAuthGrant.findUnique({
      where: { secretHash: sha256(code) },
    });
    if (
      !grant ||
      grant.kind !== 'code' ||
      grant.clientId !== clientId ||
      grant.usedAt ||
      grant.expiresAt < new Date()
    ) {
      throw new InvalidGrantError('Authorization code is invalid');
    }
    return grant;
  }

  private callbackUrl(
    grant: GrantRow,
    query: { code?: string; error?: string },
  ) {
    const url = new URL(grant.redirectUri);
    if (query.code) url.searchParams.set('code', query.code);
    if (query.error) url.searchParams.set('error', query.error);
    if (grant.state) url.searchParams.set('state', grant.state);
    return url.toString();
  }

  private async issueTokens(input: {
    userId: string;
    clientId: string;
    scope: string;
    resource: string | null;
  }) {
    const user = await this.loadActiveUser(input.userId);
    const resource = input.resource ?? mcpResourceUrl().href;
    const accessToken = this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        cid: input.clientId,
        scope: input.scope,
        resource,
      },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
    const refreshToken = randomToken();
    await this.db.oAuthRefreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        clientId: input.clientId,
        userId: user.id,
        scope: input.scope,
        resource,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: input.scope,
      refresh_token: refreshToken,
    };
  }

  private async loadActiveUser(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        isArchived: true,
        isDemo: true,
        role: true,
        tokensValidAfter: true,
      },
    });
    if (!user || !user.isActive || user.isArchived) {
      throw new InvalidTokenError('User is not active');
    }
    return user;
  }

  private async getClient(clientId: string) {
    const row = await this.getClientRow(clientId);
    return row ? this.toClient(row) : undefined;
  }

  private async registerClient(
    client: OAuthClientInformationFull,
  ): Promise<OAuthClientInformationFull> {
    await this.db.oAuthClient.create({
      data: {
        clientId: client.client_id,
        clientSecret: client.client_secret,
        clientSecretExpiresAt: client.client_secret_expires_at,
        clientIdIssuedAt:
          client.client_id_issued_at ?? Math.floor(Date.now() / 1000),
        redirectUris: client.redirect_uris.map(String),
        tokenEndpointAuthMethod: client.token_endpoint_auth_method,
        grantTypes: client.grant_types,
        responseTypes: client.response_types,
        clientName: client.client_name,
        clientUri: client.client_uri ? String(client.client_uri) : undefined,
        logoUri: client.logo_uri ? String(client.logo_uri) : undefined,
        scope: client.scope,
      },
    });
    return client;
  }

  private async getClientRow(clientId: string) {
    return this.db.oAuthClient.findUnique({
      where: { clientId },
    });
  }

  private toClient(row: ClientRow): OAuthClientInformationFull {
    const uris = Array.isArray(row.redirectUris) ? row.redirectUris : [];
    return {
      client_id: row.clientId,
      client_secret: row.clientSecret ?? undefined,
      client_secret_expires_at: row.clientSecretExpiresAt ?? undefined,
      client_id_issued_at: row.clientIdIssuedAt,
      redirect_uris: uris.map((uri) => String(uri)),
      token_endpoint_auth_method: row.tokenEndpointAuthMethod ?? undefined,
      grant_types: arrayOf(row.grantTypes),
      response_types: arrayOf(row.responseTypes),
      client_name: row.clientName ?? undefined,
      client_uri: row.clientUri ?? undefined,
      logo_uri: row.logoUri ?? undefined,
      scope: row.scope ?? undefined,
    };
  }
}

function arrayOf(value: unknown) {
  return Array.isArray(value) ? value.map(String) : undefined;
}
