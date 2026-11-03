import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { McpAuthGuard } from './mcp-auth.guard';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/enums.js';
import { McpController } from './mcp.controller';
import { NOVA_MCP_TOOL_NAMES, NovaTool } from './mcp-tools';
import { NovaMcpServerFactory } from './nova-mcp.server';

const actor: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@nova.app',
  isDemo: false,
  role: UserRole.USER,
};

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type JsonRpc = {
  result?: {
    serverInfo?: { name?: string };
    protocolVersion?: string;
    tools?: { name: string }[];
    isError?: boolean;
    content?: { text: string }[];
  };
  error?: { message?: string };
};

function jsonRpc(response: { body: unknown }): JsonRpc {
  if (!response.body || typeof response.body !== 'object') {
    throw new Error('Expected a JSON-RPC body');
  }
  return response.body;
}

function guard() {
  return {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<{
        headers: { authorization?: string };
        user?: AuthUser;
      }>();
      if (req.headers.authorization !== 'Bearer test-token') {
        throw new UnauthorizedException();
      }
      req.user = actor;
      return true;
    },
  };
}

function deps() {
  return {
    access: {
      assertProject: jest.fn().mockResolvedValue({ role: 'MEMBER' }),
      assertTask: jest.fn(),
      assertTasks: jest.fn(),
      assertSubtask: jest.fn(),
      assertSubtasks: jest.fn(),
      assertComment: jest.fn(),
    },
    projects: {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      addMember: jest.fn(),
      updateMember: jest.fn(),
      removeMember: jest.fn(),
    },
    tasks: {
      create: jest.fn(),
      findOne: jest.fn(),
      findByProject: jest.fn(),
      assignTasks: jest.fn(),
      unassignTask: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    },
    subtasks: {
      create: jest.fn(),
      update: jest.fn(),
      assignSubtasks: jest.fn(),
      unassignSubtask: jest.fn(),
      remove: jest.fn(),
    },
    comments: {
      create: jest.fn(),
      findByTask: jest.fn(),
      reply: jest.fn(),
      close: jest.fn(),
    },
    search: { search: jest.fn() },
    dashboard: {
      getSummary: jest.fn().mockResolvedValue({ metrics: { open: 1 } }),
    },
    demo: { assertNotDemo: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('McpController', () => {
  it('attaches McpAuthGuard to the controller', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      McpController,
    ) as unknown[];
    expect(guards).toContain(McpAuthGuard);
  });

  describe('HTTP', () => {
    let app: INestApplication;
    let services: ReturnType<typeof deps>;

    beforeEach(async () => {
      services = deps();
      const moduleRef = await Test.createTestingModule({
        controllers: [McpController],
        providers: [
          {
            provide: NovaMcpServerFactory,
            useValue: {
              create: () =>
                new NovaMcpServerFactory(
                  services.access as never,
                  services.projects as never,
                  services.tasks as never,
                  services.subtasks as never,
                  services.comments as never,
                  services.search as never,
                  services.dashboard as never,
                  services.demo as never,
                ).create(actor),
            },
          },
        ],
      })
        .overrideGuard(McpAuthGuard)
        .useValue(guard())
        .compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    const http = () =>
      request(app.getHttpServer() as Parameters<typeof request>[0]);

    const mcp = () =>
      http()
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', 'application/json, text/event-stream')
        .set('Content-Type', 'application/json');

    it('returns 401 when the bearer token is missing', async () => {
      const response = await http()
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

      expect(response.status).toBe(401);
    });

    it('returns 405 for GET and DELETE', async () => {
      const get = await http()
        .get('/mcp')
        .set('Authorization', 'Bearer test-token');
      const del = await http()
        .delete('/mcp')
        .set('Authorization', 'Bearer test-token');

      expect(get.status).toBe(405);
      expect(jsonRpc(get).error?.message).toBe('Method not allowed.');
      expect(del.status).toBe(405);
      expect(jsonRpc(del).error?.message).toBe('Method not allowed.');
    });

    it('negotiates initialize as JSON and names the server nova', async () => {
      const response = await mcp().send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'cursor', version: '1.0.0' },
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(jsonRpc(response).result?.serverInfo).toMatchObject({
        name: 'nova',
      });
      expect(jsonRpc(response).result?.protocolVersion).toBeTruthy();
    });

    it('lists tools when Swagger sends Accept */*', async () => {
      const response = await http()
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', '*/*')
        .set('Content-Type', 'application/json')
        .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

      expect(response.status).toBe(200);
      const names = (jsonRpc(response).result?.tools ?? []).map(
        (tool) => tool.name,
      );
      expect(names.sort()).toEqual([...NOVA_MCP_TOOL_NAMES].sort());
    });

    it('lists tools on a fresh stateless request', async () => {
      const response = await mcp().send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });

      expect(response.status).toBe(200);
      const names = (jsonRpc(response).result?.tools ?? []).map(
        (tool) => tool.name,
      );
      expect(names.sort()).toEqual([...NOVA_MCP_TOOL_NAMES].sort());
    });

    it('returns the dashboard for the authenticated user', async () => {
      const response = await mcp().send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: NovaTool.getDashboard, arguments: {} },
      });

      expect(response.status).toBe(200);
      const result = jsonRpc(response).result;
      expect(result?.isError).toBeUndefined();
      expect(JSON.parse(result?.content?.[0]?.text ?? '')).toEqual({
        metrics: { open: 1 },
      });
      expect(services.dashboard.getSummary).toHaveBeenCalledWith(actor.id);
    });

    it('rejects a create-task call when membership fails', async () => {
      services.access.assertProject.mockRejectedValue(
        new ForbiddenException('You do not have the required project role'),
      );

      const response = await mcp().send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: NovaTool.createTask,
          arguments: { title: 'Sneak in', projectId: PROJECT_ID },
        },
      });

      expect(response.status).toBe(200);
      const result = jsonRpc(response).result;
      expect(result?.isError).toBe(true);
      expect(result?.content?.[0]?.text).toBe(
        'You do not have the required project role',
      );
      expect(services.tasks.create).not.toHaveBeenCalled();
    });

    it('does not strip unknown JSON-RPC fields before the protocol parser', async () => {
      const response = await mcp().send({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/list',
        extra: 'leave-me',
      });

      // The global ValidationPipe would remove `extra` if it treated this body
      // as a DTO. The protocol parser then sees the field and rejects it.
      expect(response.status).toBe(400);
      expect(jsonRpc(response).error?.message).toMatch(/JSON-RPC|Invalid/);
    });
  });
});
