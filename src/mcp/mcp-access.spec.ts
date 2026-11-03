import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole } from '../common/decorators/require-project-role.decorator';
import {
  COMMENT_MODERATE_ROLES,
  McpAccessService,
  PROJECT_MANAGE_ROLES,
  PROJECT_OWNER_ROLES,
  READ_ROLES,
  TASK_WRITE_ROLES,
} from './mcp-access';

const USER = 'user-1';
const PROJECT = 'project-1';

function prismaMock() {
  return {
    project: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    task: { findUnique: jest.fn() },
    subtask: { findUnique: jest.fn() },
    taskComment: { findUnique: jest.fn() },
  };
}

describe('McpAccessService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let access: McpAccessService;

  beforeEach(() => {
    prisma = prismaMock();
    access = new McpAccessService(prisma as never);
  });

  function member(role: ProjectRole | null) {
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT });
    prisma.projectMember.findUnique.mockResolvedValue(role ? { role } : null);
  }

  it('rejects a missing project before checking membership', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(
      access.assertProject(USER, PROJECT, READ_ROLES),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a user who is not a member', async () => {
    member(null);

    await expect(
      access.assertProject(USER, PROJECT, READ_ROLES),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a viewer read and blocks a viewer from writing', async () => {
    member(ProjectRole.VIEWER);

    await expect(
      access.assertProject(USER, PROJECT, READ_ROLES),
    ).resolves.toEqual({ role: ProjectRole.VIEWER });
    await expect(
      access.assertProject(USER, PROJECT, TASK_WRITE_ROLES),
    ).rejects.toThrow('You do not have the required project role');
  });

  it('lets a member write tasks and blocks project management', async () => {
    member(ProjectRole.MEMBER);

    await expect(
      access.assertProject(USER, PROJECT, TASK_WRITE_ROLES),
    ).resolves.toEqual({ role: ProjectRole.MEMBER });
    await expect(
      access.assertProject(USER, PROJECT, PROJECT_MANAGE_ROLES),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin manage a project and blocks project deletion', async () => {
    member(ProjectRole.ADMIN);

    await expect(
      access.assertProject(USER, PROJECT, PROJECT_MANAGE_ROLES),
    ).resolves.toEqual({ role: ProjectRole.ADMIN });
    await expect(
      access.assertProject(USER, PROJECT, PROJECT_OWNER_ROLES),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the owner delete', async () => {
    member(ProjectRole.OWNER);

    await expect(
      access.assertProject(USER, PROJECT, PROJECT_OWNER_ROLES),
    ).resolves.toEqual({ role: ProjectRole.OWNER });
  });

  it('resolves a task to its project and 404s when the task is missing', async () => {
    prisma.task.findUnique.mockResolvedValueOnce({ projectId: PROJECT });
    member(ProjectRole.MEMBER);

    await expect(
      access.assertTask(USER, 'task-1', TASK_WRITE_ROLES),
    ).resolves.toEqual({ role: ProjectRole.MEMBER });
    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: USER, projectId: PROJECT } },
      select: { role: true },
    });

    prisma.task.findUnique.mockResolvedValueOnce(null);
    await expect(
      access.assertTask(USER, 'missing', READ_ROLES),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checks every task in a bulk assignment and stops on the first denial', async () => {
    prisma.task.findUnique
      .mockResolvedValueOnce({ projectId: PROJECT })
      .mockResolvedValueOnce({ projectId: 'other-project' });
    prisma.projectMember.findUnique
      .mockResolvedValueOnce({ role: ProjectRole.MEMBER })
      .mockResolvedValueOnce(null);

    await expect(
      access.assertTasks(USER, ['task-1', 'task-2'], TASK_WRITE_ROLES),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.findUnique).toHaveBeenCalledTimes(2);
  });

  it('resolves a subtask through its parent task', async () => {
    prisma.subtask.findUnique.mockResolvedValueOnce({
      task: { projectId: PROJECT },
    });
    member(ProjectRole.MEMBER);

    await expect(
      access.assertSubtask(USER, 'sub-1', TASK_WRITE_ROLES),
    ).resolves.toEqual({ role: ProjectRole.MEMBER });

    prisma.subtask.findUnique.mockResolvedValueOnce(null);
    await expect(
      access.assertSubtasks(USER, ['missing'], READ_ROLES),
    ).rejects.toThrow('Subtask not found');
  });

  it('lets an admin moderate a comment and blocks a member', async () => {
    prisma.taskComment.findUnique.mockResolvedValue({
      task: { projectId: PROJECT },
    });
    member(ProjectRole.ADMIN);

    await expect(
      access.assertComment(USER, 'comment-1', COMMENT_MODERATE_ROLES),
    ).resolves.toEqual({ role: ProjectRole.ADMIN });

    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.MEMBER,
    });
    await expect(
      access.assertComment(USER, 'comment-1', COMMENT_MODERATE_ROLES),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the comment does not exist', async () => {
    prisma.taskComment.findUnique.mockResolvedValue(null);

    await expect(
      access.assertComment(USER, 'missing', READ_ROLES),
    ).rejects.toThrow('Task comment not found');
  });
});
