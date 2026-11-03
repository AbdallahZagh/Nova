import { NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { NovaOAuthProvider } from './oauth.provider';

type Row = Record<string, unknown> & { id?: string };

function memory() {
  const tables: Record<string, Row[]> = {
    oAuthClient: [],
    oAuthGrant: [],
    oAuthRefreshToken: [],
    user: [],
  };
  let sequence = 0;

  function table(name: string) {
    return {
      create({ data }: { data: Row }) {
        const row = {
          id: `row-${++sequence}`,
          usedAt: null,
          revokedAt: null,
          ...data,
        };
        tables[name].push(row);
        return row;
      },
      findUnique({ where }: { where: Row }) {
        return (
          tables[name].find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) ?? null
        );
      },
      update({ where, data }: { where: Row; data: Row }) {
        const row = tables[name].find((item) => item.id === where.id);
        if (!row) throw new Error('missing row');
        Object.assign(row, data);
        return row;
      },
      updateMany({ where, data }: { where: Row; data: Row }) {
        const matches = tables[name].filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        );
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      },
    };
  }

  const prisma = {
    oAuthClient: table('oAuthClient'),
    oAuthGrant: table('oAuthGrant'),
    oAuthRefreshToken: table('oAuthRefreshToken'),
    user: table('user'),
  };
  return { prisma, tables };
}

const user: AuthUser = {
  id: 'user-1',
  email: 'owner@nova.app',
  isDemo: false,
  role: UserRole.USER,
};

function redirectCapture() {
  let location = '';
  const res = {
    redirect(url: string) {
      location = url;
    },
  };
  return { res: res as unknown as Response, read: () => location };
}

describe('NovaOAuthProvider', () => {
  const jwt = new JwtService({
    secret: 'oauth-test-secret',
    signOptions: { expiresIn: '7d' },
  });
  const { prisma, tables } = memory();
  const provider = new NovaOAuthProvider(
    prisma as unknown as PrismaService,
    jwt,
  );
  const client: OAuthClientInformationFull = {
    client_id: 'agent-1',
    client_secret: 'secret-1',
    redirect_uris: ['http://127.0.0.1/callback'] as never,
    client_name: 'Cursor',
    token_endpoint_auth_method: 'none',
  };

  beforeAll(async () => {
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.MCP_ISSUER_URL = 'http://localhost:8000';
    tables.user.push({
      id: user.id,
      email: user.email,
      isActive: true,
      isArchived: false,
      isDemo: false,
      role: UserRole.USER,
      tokensValidAfter: null,
    });
    await provider.registerClient(client);
  });

  it('opens Nova, then exchanges an approval for a verifiable token', async () => {
    const pending = redirectCapture();
    await provider.authorize(
      client,
      {
        redirectUri: 'http://127.0.0.1:43111/callback',
        codeChallenge: 'challenge-1',
        state: 'state-1',
      },
      pending.res,
    );

    const requestUrl = new URL(pending.read());
    expect(requestUrl.origin).toBe('http://localhost:3000');
    expect(requestUrl.pathname).toBe('/connect');
    const requestId = requestUrl.searchParams.get('request');
    expect(requestId).toBeTruthy();

    await expect(provider.describeRequest(requestId!)).resolves.toMatchObject({
      clientName: 'Cursor',
      redirectHost: '127.0.0.1:43111',
      scope: 'nova',
    });

    const approved = await provider.approveRequest(requestId!, user);
    const callback = new URL(approved.redirectTo);
    expect(callback.origin).toBe('http://127.0.0.1:43111');
    expect(callback.searchParams.get('state')).toBe('state-1');
    const code = callback.searchParams.get('code');
    expect(code).toBeTruthy();

    await expect(
      provider.challengeForAuthorizationCode(client, code!),
    ).resolves.toBe('challenge-1');
    const tokens = await provider.exchangeAuthorizationCode(client, code!);
    expect(tokens.expires_in).toBe(60 * 60 * 24 * 7);
    expect(tokens.refresh_token).toBeTruthy();

    const auth = await provider.verifyAccessToken(tokens.access_token);
    expect(auth.clientId).toBe('agent-1');
    expect(auth.scopes).toEqual(['nova']);
    expect(auth.expiresAt).toEqual(expect.any(Number));
    expect(auth.resource?.pathname).toBe('/mcp');
    expect(provider.userFromAuth(auth)).toMatchObject({
      id: user.id,
      email: user.email,
    });

    await expect(
      provider.exchangeAuthorizationCode(client, code!),
    ).rejects.toBeInstanceOf(InvalidGrantError);

    const refreshed = await provider.exchangeRefreshToken(
      client,
      tokens.refresh_token,
    );
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
    await expect(
      provider.verifyAccessToken(refreshed.access_token),
    ).resolves.toMatchObject({ clientId: 'agent-1' });
    await expect(
      provider.exchangeRefreshToken(client, tokens.refresh_token),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it('sends a denied agent back with access_denied', async () => {
    const pending = redirectCapture();
    await provider.authorize(
      client,
      {
        redirectUri: 'http://127.0.0.1/callback',
        codeChallenge: 'challenge-2',
      },
      pending.res,
    );
    const requestId = new URL(pending.read()).searchParams.get('request')!;
    const denied = await provider.denyRequest(requestId);
    expect(new URL(denied.redirectTo).searchParams.get('error')).toBe(
      'access_denied',
    );
    await expect(provider.describeRequest(requestId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('accepts a normal Nova login token', async () => {
    const accessToken = jwt.sign({ sub: user.id, email: user.email });
    const auth = await provider.verifyAccessToken(accessToken);
    expect(auth.clientId).toBe('nova-app');
    expect(auth.scopes).toEqual(['nova']);
  });
});
