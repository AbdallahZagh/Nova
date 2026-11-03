import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NovaOAuthProvider } from '../oauth/oauth.provider';
import { McpAuthGuard } from './mcp-auth.guard';

@Controller('probe')
@UseGuards(McpAuthGuard)
class ProbeController {
  @Get()
  ok() {
    return { ok: true };
  }
}

describe('McpAuthGuard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MCP_ISSUER_URL = 'http://localhost:8000';
    const oauth = {
      verifyAccessToken: jest.fn((token: string) => {
        if (token !== 'good-token')
          throw new Error('Access token is invalid or expired');
        return {
          token,
          clientId: 'agent-1',
          scopes: ['nova'],
          expiresAt: Math.floor(Date.now() / 1000) + 60,
          extra: {},
        };
      }),
      userFromAuth: jest.fn(() => ({
        id: 'user-1',
        email: 'owner@nova.app',
        isDemo: false,
        role: 'USER',
      })),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        McpAuthGuard,
        { provide: NovaOAuthProvider, useValue: oauth },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers a missing token with the Nova sign-in challenge', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    ).get('/probe');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain(
      'resource_metadata="http://localhost:8000/.well-known/oauth-protected-resource/mcp"',
    );
    expect(response.headers['www-authenticate']).toContain(
      'error="invalid_token"',
    );
  });

  it('accepts a verified token', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get('/probe')
      .set('Authorization', 'Bearer good-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
