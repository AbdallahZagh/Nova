import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../generated/prisma/enums.js';
import {
  PROJECT_MANAGE_ROLES,
  PROJECT_OWNER_ROLES,
  READ_ROLES,
  TASK_WRITE_ROLES,
  COMMENT_MODERATE_ROLES,
} from './mcp-access';
import {
  DEMO_MESSAGES,
  EXCLUDED_MCP_TOOLS,
  NOVA_MCP_TOOL_NAMES,
  NovaTool,
} from './mcp-tools';
import { createNovaMcpServer, NovaMcpDeps } from './nova-mcp.server';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TASK_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TASK_ID_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUBTASK_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const COMMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const actor: AuthUser = {
  id: USER_ID,
  email: 'owner@nova.app',
  isDemo: false,
  role: UserRole.USER,
};

function services() {
  return {
    access: {
      assertProject: jest.fn().mockResolvedValue({ role: 'MEMBER' }),
      assertTask: jest.fn().mockResolvedValue({ role: 'MEMBER' }),
      assertTasks: jest.fn().mockResolvedValue(undefined),
      assertSubtask: jest.fn().mockResolvedValue({ role: 'MEMBER' }),
      assertSubtasks: jest.fn().mockResolvedValue(undefined),
      assertComment: jest.fn().mockResolvedValue({ role: 'ADMIN' }),
    },
    projects: {
      create: jest.fn().mockResolvedValue({ id: PROJECT_ID, name: 'Nova' }),
      findAll: jest.fn().mockResolvedValue([{ id: PROJECT_ID }]),
      findOne: jest.fn().mockResolvedValue({ id: PROJECT_ID, name: 'Nova' }),
      update: jest.fn().mockResolvedValue({ id: PROJECT_ID, name: 'Renamed' }),
      remove: jest
        .fn()
        .mockResolvedValue({ message: 'Project deleted successfully' }),
      addMember: jest.fn().mockResolvedValue({ userId: OTHER_USER }),
      updateMember: jest
        .fn()
        .mockResolvedValue({ userId: OTHER_USER, role: 'ADMIN' }),
      removeMember: jest.fn().mockResolvedValue({ message: 'Member removed' }),
    },
    tasks: {
      create: jest.fn().mockResolvedValue({ id: TASK_ID, title: 'Ship MCP' }),
      findOne: jest.fn().mockResolvedValue({ id: TASK_ID }),
      findByProject: jest.fn().mockResolvedValue([{ id: TASK_ID }]),
      assignTasks: jest.fn().mockResolvedValue({ assigned: 2 }),
      unassignTask: jest.fn().mockResolvedValue({ id: TASK_ID }),
      update: jest
        .fn()
        .mockResolvedValue({ id: TASK_ID, status: 'In Progress' }),
      remove: jest
        .fn()
        .mockResolvedValue({ message: 'Task deleted successfully' }),
    },
    subtasks: {
      create: jest.fn().mockResolvedValue({ id: SUBTASK_ID }),
      update: jest
        .fn()
        .mockResolvedValue({ id: SUBTASK_ID, isCompleted: true }),
      assignSubtasks: jest.fn().mockResolvedValue([{ id: SUBTASK_ID }]),
      unassignSubtask: jest.fn().mockResolvedValue({ id: SUBTASK_ID }),
      remove: jest.fn().mockResolvedValue({ message: 'Subtask deleted' }),
    },
    comments: {
      create: jest.fn().mockResolvedValue({ id: COMMENT_ID }),
      findByTask: jest.fn().mockResolvedValue([{ id: COMMENT_ID }]),
      reply: jest
        .fn()
        .mockResolvedValue({ id: COMMENT_ID, replyContent: 'Done' }),
      close: jest.fn().mockResolvedValue({ id: COMMENT_ID, status: 'CLOSED' }),
    },
    search: {
      search: jest.fn().mockResolvedValue({ projects: [], tasks: [] }),
    },
    dashboard: {
      getSummary: jest.fn().mockResolvedValue({
        metrics: { open: 3 },
        urgentTasks: [],
      }),
    },
    demo: {
      assertNotDemo: jest.fn().mockResolvedValue(undefined),
    },
  };
}

type Services = ReturnType<typeof services>;

function textOf(result: { content?: unknown; isError?: boolean }) {
  const content = result.content as { type: string; text?: string }[];
  return content[0]?.text ?? '';
}

async function withClient(deps: Services) {
  const server = createNovaMcpServer(actor, deps as unknown as NovaMcpDeps);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'nova-test', version: '1.0.0' });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe('Nova MCP tools', () => {
  let deps: Services;
  let client: Client;
  let close: () => Promise<void>;

  beforeEach(async () => {
    deps = services();
    const session = await withClient(deps);
    client = session.client;
    close = session.close;
  });

  afterEach(async () => {
    await close();
  });

  it('exposes the read and write tools and nothing else', async () => {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([...NOVA_MCP_TOOL_NAMES].sort());
    for (const excluded of EXCLUDED_MCP_TOOLS) {
      expect(names).not.toContain(excluded);
    }
    expect(
      names.some((name) => name.includes('ai') || name.includes('admin')),
    ).toBe(false);
  });

  it('returns the signed-in user dashboard', async () => {
    const result = await client.callTool({
      name: NovaTool.getDashboard,
      arguments: {},
    });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual({
      metrics: { open: 3 },
      urgentTasks: [],
    });
    expect(deps.dashboard.getSummary).toHaveBeenCalledWith(USER_ID);
  });

  it('searches as the signed-in user', async () => {
    await client.callTool({
      name: NovaTool.search,
      arguments: { query: 'launch' },
    });
    expect(deps.search.search).toHaveBeenCalledWith(USER_ID, 'launch');
  });

  it('lists projects and reads a task only after a membership check', async () => {
    await client.callTool({ name: NovaTool.listProjects, arguments: {} });
    expect(deps.projects.findAll).toHaveBeenCalledWith(USER_ID);

    await client.callTool({
      name: NovaTool.getTask,
      arguments: { taskId: TASK_ID },
    });
    expect(deps.access.assertTask).toHaveBeenCalledWith(
      USER_ID,
      TASK_ID,
      READ_ROLES,
    );
    expect(deps.tasks.findOne).toHaveBeenCalledWith(TASK_ID);
  });

  it('rejects create_task for a project the user cannot write', async () => {
    deps.access.assertProject.mockRejectedValue(
      new ForbiddenException('You do not have the required project role'),
    );

    const result = await client.callTool({
      name: NovaTool.createTask,
      arguments: { title: 'Sneak in', projectId: PROJECT_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('You do not have the required project role');
    expect(deps.tasks.create).not.toHaveBeenCalled();
  });

  it('creates a task for a member and keeps unknown fields off the dto', async () => {
    const result = await client.callTool({
      name: NovaTool.createTask,
      arguments: {
        title: 'Ship MCP',
        projectId: PROJECT_ID,
        priority: 'High',
        leaked: 'nope',
      },
    });

    expect(result.isError).toBeUndefined();
    expect(deps.access.assertProject).toHaveBeenCalledWith(
      USER_ID,
      PROJECT_ID,
      TASK_WRITE_ROLES,
    );
    expect(deps.tasks.create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        title: 'Ship MCP',
        projectId: PROJECT_ID,
        priority: 'High',
      }),
    );
    const calls = deps.tasks.create.mock.calls as unknown as [
      string,
      { leaked?: string },
    ][];
    expect(calls[0][1].leaked).toBeUndefined();
  });

  it('rejects a due date the API would reject before touching the database', async () => {
    const result = await client.callTool({
      name: NovaTool.createTask,
      arguments: {
        title: 'Ship MCP',
        projectId: PROJECT_ID,
        dueDate: 'next week',
      },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('dueDate');
    expect(deps.access.assertProject).not.toHaveBeenCalled();
    expect(deps.tasks.create).not.toHaveBeenCalled();
  });

  it('hides unexpected service failures', async () => {
    deps.dashboard.getSummary.mockRejectedValue(new Error('password=secret'));

    const result = await client.callTool({
      name: NovaTool.getDashboard,
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Unexpected error');
    expect(textOf(result)).not.toContain('secret');
  });

  it('deletes a project only for the owner and blocks the demo account', async () => {
    deps.access.assertProject.mockResolvedValue({ role: 'OWNER' });
    const deleted = await client.callTool({
      name: NovaTool.deleteProject,
      arguments: { projectId: PROJECT_ID },
    });

    expect(deleted.isError).toBeUndefined();
    expect(deps.access.assertProject).toHaveBeenCalledWith(
      USER_ID,
      PROJECT_ID,
      PROJECT_OWNER_ROLES,
    );
    expect(deps.demo.assertNotDemo).toHaveBeenCalledWith(
      USER_ID,
      DEMO_MESSAGES.deleteProject,
    );
    expect(deps.projects.remove).toHaveBeenCalledWith(USER_ID, PROJECT_ID);

    deps.demo.assertNotDemo.mockRejectedValue(
      new ForbiddenException(DEMO_MESSAGES.deleteProject),
    );
    const blocked = await client.callTool({
      name: NovaTool.deleteProject,
      arguments: { projectId: PROJECT_ID },
    });
    expect(blocked.isError).toBe(true);
    expect(textOf(blocked)).toBe(DEMO_MESSAGES.deleteProject);
    expect(deps.projects.remove).toHaveBeenCalledTimes(1);
  });

  it('does not check the demo flag when the caller is not the owner', async () => {
    deps.access.assertProject.mockRejectedValue(
      new ForbiddenException('You do not have the required project role'),
    );

    const result = await client.callTool({
      name: NovaTool.deleteProject,
      arguments: { projectId: PROJECT_ID },
    });

    expect(result.isError).toBe(true);
    expect(deps.demo.assertNotDemo).not.toHaveBeenCalled();
    expect(deps.projects.remove).not.toHaveBeenCalled();
  });

  it('blocks a member from updating a project', async () => {
    deps.access.assertProject.mockRejectedValue(
      new ForbiddenException('You do not have the required project role'),
    );

    const result = await client.callTool({
      name: NovaTool.updateProject,
      arguments: { projectId: PROJECT_ID, name: 'Taken' },
    });

    expect(result.isError).toBe(true);
    expect(deps.access.assertProject).toHaveBeenCalledWith(
      USER_ID,
      PROJECT_ID,
      PROJECT_MANAGE_ROLES,
    );
    expect(deps.projects.update).not.toHaveBeenCalled();
  });

  it('assigns every listed task only after each one is authorized', async () => {
    await client.callTool({
      name: NovaTool.assignTask,
      arguments: {
        assignments: [{ userId: OTHER_USER, taskIds: [TASK_ID, TASK_ID_2] }],
      },
    });

    expect(deps.access.assertTasks).toHaveBeenCalledWith(
      USER_ID,
      [TASK_ID, TASK_ID_2],
      TASK_WRITE_ROLES,
    );
    expect(deps.tasks.assignTasks).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        assignments: [{ userId: OTHER_USER, taskIds: [TASK_ID, TASK_ID_2] }],
      }),
    );
  });

  it('requires an owner or admin to reply to a comment', async () => {
    deps.access.assertComment.mockRejectedValue(
      new ForbiddenException('You do not have the required project role'),
    );

    const result = await client.callTool({
      name: NovaTool.replyTaskComment,
      arguments: { commentId: COMMENT_ID, replyContent: 'Use the picker' },
    });

    expect(result.isError).toBe(true);
    expect(deps.access.assertComment).toHaveBeenCalledWith(
      USER_ID,
      COMMENT_ID,
      COMMENT_MODERATE_ROLES,
    );
    expect(deps.comments.reply).not.toHaveBeenCalled();
  });

  it('returns not found when the task does not exist', async () => {
    deps.access.assertTask.mockRejectedValue(
      new NotFoundException('Task not found'),
    );

    const result = await client.callTool({
      name: NovaTool.listTaskComments,
      arguments: { taskId: TASK_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Task not found');
    expect(deps.comments.findByTask).not.toHaveBeenCalled();
  });

  it('writes subtasks and comments through the existing services', async () => {
    await client.callTool({
      name: NovaTool.createSubtask,
      arguments: { taskId: TASK_ID, title: 'Cover the 401' },
    });
    expect(deps.access.assertTask).toHaveBeenCalledWith(
      USER_ID,
      TASK_ID,
      TASK_WRITE_ROLES,
    );
    expect(deps.subtasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, title: 'Cover the 401' }),
    );

    await client.callTool({
      name: NovaTool.updateSubtask,
      arguments: { subtaskId: SUBTASK_ID, isCompleted: true },
    });
    expect(deps.access.assertSubtask).toHaveBeenCalledWith(
      USER_ID,
      SUBTASK_ID,
      TASK_WRITE_ROLES,
    );
    expect(deps.subtasks.update).toHaveBeenCalledWith(
      SUBTASK_ID,
      expect.objectContaining({ isCompleted: true }),
    );

    await client.callTool({
      name: NovaTool.closeTaskComment,
      arguments: { commentId: COMMENT_ID },
    });
    expect(deps.comments.close).toHaveBeenCalledWith(COMMENT_ID, USER_ID);
  });
});
