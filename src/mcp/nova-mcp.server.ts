import { HttpException, Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { DashboardService } from '../dashboard/dashboard.service';
import { DemoService } from '../demo/demo.service';
import { AddProjectMemberDto } from '../projects/dto/add-project-member.dto';
import { CreateProjectDto } from '../projects/dto/create-project.dto';
import { UpdateProjectMemberDto } from '../projects/dto/update-project-member.dto';
import { UpdateProjectDto } from '../projects/dto/update-project.dto';
import { ProjectsService } from '../projects/projects.service';
import { SearchService } from '../search/search.service';
import { AssignSubtasksDto } from '../subtasks/dto/assign-subtasks.dto';
import { CreateSubtaskDto } from '../subtasks/dto/create-subtask.dto';
import { UpdateSubtaskDto } from '../subtasks/dto/update-subtask.dto';
import { SubtasksService } from '../subtasks/subtasks.service';
import { CreateTaskCommentDto } from '../task-comments/dto/create-task-comment.dto';
import { ReplyTaskCommentDto } from '../task-comments/dto/reply-task-comment.dto';
import { TaskCommentsService } from '../task-comments/task-comments.service';
import { AssignTasksDto } from '../tasks/dto/assign-tasks.dto';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../tasks/dto/update-task.dto';
import { TasksService } from '../tasks/tasks.service';
import {
  COMMENT_MODERATE_ROLES,
  McpAccessService,
  PROJECT_MANAGE_ROLES,
  PROJECT_OWNER_ROLES,
  READ_ROLES,
  TASK_WRITE_ROLES,
} from './mcp-access';
import { parseDto } from './mcp-dto';
import { publicError } from './mcp-errors';
import { DEMO_MESSAGES, NovaTool } from './mcp-tools';

const logger = new Logger('NovaMcp');

const id = z.string().min(1);
const projectStatus = z.enum([
  'Active',
  'In Progress',
  'Completed',
  'Archived',
]);
const taskStatus = z.enum(['To Do', 'In Progress', 'In Review', 'Completed']);
const taskPriority = z.enum(['Low', 'Medium', 'High', 'Critical']);
const projectRole = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);

const readOnly = { readOnlyHint: true };
const destructive = { destructiveHint: true };

export interface NovaMcpDeps {
  access: McpAccessService;
  projects: ProjectsService;
  tasks: TasksService;
  subtasks: SubtasksService;
  comments: TaskCommentsService;
  search: SearchService;
  dashboard: DashboardService;
  demo: DemoService;
}

export function createNovaMcpServer(user: AuthUser, deps: NovaMcpDeps) {
  const server = new McpServer({ name: 'nova', version: '1.0.0' });
  registerNovaTools(server, user, deps);
  return server;
}

@Injectable()
export class NovaMcpServerFactory {
  constructor(
    private readonly access: McpAccessService,
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
    private readonly subtasks: SubtasksService,
    private readonly comments: TaskCommentsService,
    private readonly search: SearchService,
    private readonly dashboard: DashboardService,
    private readonly demo: DemoService,
  ) {}

  create(user: AuthUser) {
    return createNovaMcpServer(user, this);
  }
}

function registerNovaTools(
  server: McpServer,
  user: AuthUser,
  deps: NovaMcpDeps,
) {
  const run = (name: string, fn: () => Promise<unknown>) => {
    return async (): Promise<CallToolResult> => {
      try {
        return {
          content: [{ type: 'text', text: JSON.stringify(await fn()) }],
        };
      } catch (error) {
        if (!(error instanceof HttpException)) logger.error(`${name} failed`);
        return {
          isError: true,
          content: [{ type: 'text', text: publicError(error) }],
        };
      }
    };
  };

  server.registerTool(
    NovaTool.getDashboard,
    {
      description:
        'Dashboard summary for the signed-in user: metrics, activity, and urgent tasks.',
      annotations: readOnly,
    },
    run(NovaTool.getDashboard, () => deps.dashboard.getSummary(user.id)),
  );

  server.registerTool(
    NovaTool.search,
    {
      description:
        'Search the signed-in user projects, tasks, boards, and people.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Search text. Omit to list broadly.'),
      }),
      annotations: readOnly,
    },
    async (args) =>
      run(NovaTool.search, () => deps.search.search(user.id, args.query))(),
  );

  server.registerTool(
    NovaTool.listProjects,
    {
      description: 'List projects the signed-in user owns or belongs to.',
      annotations: readOnly,
    },
    run(NovaTool.listProjects, () => deps.projects.findAll(user.id)),
  );

  server.registerTool(
    NovaTool.getProject,
    {
      description:
        'Get one project, including members and tasks. Requires membership.',
      inputSchema: z.object({ projectId: id }),
      annotations: readOnly,
    },
    async (args) =>
      run(NovaTool.getProject, async () => {
        await deps.access.assertProject(user.id, args.projectId, READ_ROLES);
        return deps.projects.findOne(user.id, args.projectId);
      })(),
  );

  server.registerTool(
    NovaTool.listProjectTasks,
    {
      description: 'List tasks on a project board. Viewers can read.',
      inputSchema: z.object({ projectId: id }),
      annotations: readOnly,
    },
    async (args) =>
      run(NovaTool.listProjectTasks, async () => {
        await deps.access.assertProject(user.id, args.projectId, READ_ROLES);
        return deps.tasks.findByProject(args.projectId);
      })(),
  );

  server.registerTool(
    NovaTool.getTask,
    {
      description: 'Get one task. Requires membership in its project.',
      inputSchema: z.object({ taskId: id }),
      annotations: readOnly,
    },
    async (args) =>
      run(NovaTool.getTask, async () => {
        await deps.access.assertTask(user.id, args.taskId, READ_ROLES);
        return deps.tasks.findOne(args.taskId);
      })(),
  );

  server.registerTool(
    NovaTool.listTaskComments,
    {
      description: 'List comments on a task. Viewers can read.',
      inputSchema: z.object({ taskId: id }),
      annotations: readOnly,
    },
    async (args) =>
      run(NovaTool.listTaskComments, async () => {
        await deps.access.assertTask(user.id, args.taskId, READ_ROLES);
        return deps.comments.findByTask(args.taskId);
      })(),
  );

  server.registerTool(
    NovaTool.createProject,
    {
      description: 'Create a project owned by the signed-in user.',
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        status: projectStatus.optional(),
      }),
    },
    async (args) =>
      run(NovaTool.createProject, async () => {
        const dto = await parseDto(CreateProjectDto, args);
        await deps.demo.assertNotDemo(user.id, DEMO_MESSAGES.createProject);
        return deps.projects.create(user.id, dto);
      })(),
  );

  server.registerTool(
    NovaTool.updateProject,
    {
      description: 'Update a project. Owners and admins only.',
      inputSchema: z.object({
        projectId: id,
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        status: projectStatus.optional(),
      }),
    },
    async (args) =>
      run(NovaTool.updateProject, async () => {
        const { projectId, ...rest } = args;
        const dto = await parseDto(UpdateProjectDto, rest);
        await deps.access.assertProject(
          user.id,
          projectId,
          PROJECT_MANAGE_ROLES,
        );
        return deps.projects.update(user.id, projectId, dto);
      })(),
  );

  server.registerTool(
    NovaTool.deleteProject,
    {
      description: 'Permanently delete a project. The owner only.',
      inputSchema: z.object({ projectId: id }),
      annotations: destructive,
    },
    async (args) =>
      run(NovaTool.deleteProject, async () => {
        await deps.access.assertProject(
          user.id,
          args.projectId,
          PROJECT_OWNER_ROLES,
        );
        await deps.demo.assertNotDemo(user.id, DEMO_MESSAGES.deleteProject);
        return deps.projects.remove(user.id, args.projectId);
      })(),
  );

  server.registerTool(
    NovaTool.addProjectMember,
    {
      description:
        'Add one member, or several via members[]. Owners and admins only.',
      inputSchema: z.object({
        projectId: id,
        userId: z.string().uuid().optional(),
        role: projectRole.optional(),
        members: z
          .array(z.object({ userId: z.string().uuid(), role: projectRole }))
          .min(1)
          .optional(),
      }),
    },
    async (args) =>
      run(NovaTool.addProjectMember, async () => {
        const { projectId, ...rest } = args;
        const dto = await parseDto(AddProjectMemberDto, rest);
        await deps.access.assertProject(
          user.id,
          projectId,
          PROJECT_MANAGE_ROLES,
        );
        await deps.demo.assertNotDemo(user.id, DEMO_MESSAGES.addMember);
        return deps.projects.addMember(user.id, projectId, dto);
      })(),
  );

  server.registerTool(
    NovaTool.updateProjectMember,
    {
      description: 'Change a member role. Owners and admins only.',
      inputSchema: z.object({
        projectId: id,
        userId: id,
        role: projectRole,
      }),
    },
    async (args) =>
      run(NovaTool.updateProjectMember, async () => {
        const dto = await parseDto(UpdateProjectMemberDto, { role: args.role });
        await deps.access.assertProject(
          user.id,
          args.projectId,
          PROJECT_MANAGE_ROLES,
        );
        return deps.projects.updateMember(
          user.id,
          args.projectId,
          args.userId,
          dto,
        );
      })(),
  );

  server.registerTool(
    NovaTool.removeProjectMember,
    {
      description: 'Remove a member. Owners and admins only.',
      inputSchema: z.object({ projectId: id, userId: id }),
      annotations: destructive,
    },
    async (args) =>
      run(NovaTool.removeProjectMember, async () => {
        await deps.access.assertProject(
          user.id,
          args.projectId,
          PROJECT_MANAGE_ROLES,
        );
        await deps.demo.assertNotDemo(user.id, DEMO_MESSAGES.removeMember);
        return deps.projects.removeMember(user.id, args.projectId, args.userId);
      })(),
  );

  server.registerTool(
    NovaTool.createTask,
    {
      description:
        'Create a task. Members, admins, and owners. Viewers cannot. Optional subtasks are created with it.',
      inputSchema: z.object({
        title: z.string().min(1),
        projectId: id,
        description: z.string().optional(),
        status: taskStatus.optional(),
        priority: taskPriority.optional(),
        dueDate: z.string().optional(),
        assigneeId: z.string().optional(),
        subtasks: z
          .array(
            z.object({
              title: z.string().min(1),
              dueDate: z.string().optional(),
            }),
          )
          .optional(),
      }),
    },
    async (args) =>
      run(NovaTool.createTask, async () => {
        const dto = await parseDto(CreateTaskDto, args);
        await deps.access.assertProject(
          user.id,
          dto.projectId,
          TASK_WRITE_ROLES,
        );
        return deps.tasks.create(user.id, dto);
      })(),
  );

  server.registerTool(
    NovaTool.updateTask,
    {
      description: 'Update a task. Members, admins, and owners.',
      inputSchema: z.object({
        taskId: id,
        title: z.string().optional(),
        description: z.string().optional(),
        status: taskStatus.optional(),
        priority: taskPriority.optional(),
        dueDate: z.string().optional(),
        completedAt: z.string().optional(),
        assigneeId: z.string().optional(),
      }),
    },
    async (args) =>
      run(NovaTool.updateTask, async () => {
        const { taskId, ...rest } = args;
        const dto = await parseDto(UpdateTaskDto, rest);
        await deps.access.assertTask(user.id, taskId, TASK_WRITE_ROLES);
        return deps.tasks.update(user.id, taskId, dto);
      })(),
  );

  server.registerTool(
    NovaTool.deleteTask,
    {
      description:
        'Delete a task and its subtasks. Members, admins, and owners.',
      inputSchema: z.object({ taskId: id }),
      annotations: destructive,
    },
    async (args) =>
      run(NovaTool.deleteTask, async () => {
        await deps.access.assertTask(user.id, args.taskId, TASK_WRITE_ROLES);
        return deps.tasks.remove(args.taskId);
      })(),
  );

  server.registerTool(
    NovaTool.assignTask,
    {
      description:
        'Assign tasks. Pass userId plus taskIds, or assignments: [{ userId, taskIds }].',
      inputSchema: z.object({
        userId: z.string().uuid().optional(),
        taskIds: z.array(z.string().uuid()).min(1).optional(),
        assignments: z
          .array(
            z.object({
              userId: z.string().uuid(),
              taskIds: z.array(z.string().uuid()).min(1),
            }),
          )
          .min(1)
          .optional(),
      }),
    },
    async (args) =>
      run(NovaTool.assignTask, async () => {
        const dto = await parseDto(AssignTasksDto, args);
        await deps.access.assertTasks(
          user.id,
          taskIdsOf(dto),
          TASK_WRITE_ROLES,
        );
        return deps.tasks.assignTasks(user.id, dto);
      })(),
  );

  server.registerTool(
    NovaTool.unassignTask,
    {
      description: 'Remove one assignee from one task.',
      inputSchema: z.object({ taskId: id, userId: id }),
    },
    async (args) =>
      run(NovaTool.unassignTask, async () => {
        await deps.access.assertTask(user.id, args.taskId, TASK_WRITE_ROLES);
        return deps.tasks.unassignTask(user.id, args.taskId, args.userId);
      })(),
  );

  server.registerTool(
    NovaTool.createSubtask,
    {
      description: 'Add a checklist item to a task.',
      inputSchema: z.object({
        taskId: z.string().uuid(),
        title: z.string().min(1),
        dueDate: z.string().optional(),
      }),
    },
    async (args) =>
      run(NovaTool.createSubtask, async () => {
        const dto = await parseDto(CreateSubtaskDto, args);
        await deps.access.assertTask(user.id, dto.taskId, TASK_WRITE_ROLES);
        return deps.subtasks.create(dto);
      })(),
  );

  server.registerTool(
    NovaTool.updateSubtask,
    {
      description: 'Update a checklist item title, due date, or completion.',
      inputSchema: z.object({
        subtaskId: id,
        title: z.string().optional(),
        isCompleted: z.boolean().optional(),
        dueDate: z.string().optional(),
      }),
    },
    async (args) =>
      run(NovaTool.updateSubtask, async () => {
        const { subtaskId, ...rest } = args;
        const dto = await parseDto(UpdateSubtaskDto, rest);
        await deps.access.assertSubtask(user.id, subtaskId, TASK_WRITE_ROLES);
        return deps.subtasks.update(subtaskId, dto);
      })(),
  );

  server.registerTool(
    NovaTool.deleteSubtask,
    {
      description: 'Delete a checklist item.',
      inputSchema: z.object({ subtaskId: id }),
      annotations: destructive,
    },
    async (args) =>
      run(NovaTool.deleteSubtask, async () => {
        await deps.access.assertSubtask(
          user.id,
          args.subtaskId,
          TASK_WRITE_ROLES,
        );
        return deps.subtasks.remove(args.subtaskId);
      })(),
  );

  server.registerTool(
    NovaTool.assignSubtask,
    {
      description:
        'Assign subtasks. Pass userId plus subtaskIds, or assignments: [{ userId, subtaskIds }].',
      inputSchema: z.object({
        userId: z.string().uuid().optional(),
        subtaskIds: z.array(z.string().uuid()).min(1).optional(),
        assignments: z
          .array(
            z.object({
              userId: z.string().uuid(),
              subtaskIds: z.array(z.string().uuid()).min(1),
            }),
          )
          .min(1)
          .optional(),
      }),
    },
    async (args) =>
      run(NovaTool.assignSubtask, async () => {
        const dto = await parseDto(AssignSubtasksDto, args);
        await deps.access.assertSubtasks(
          user.id,
          subtaskIdsOf(dto),
          TASK_WRITE_ROLES,
        );
        return deps.subtasks.assignSubtasks(user.id, dto);
      })(),
  );

  server.registerTool(
    NovaTool.unassignSubtask,
    {
      description: 'Remove one assignee from one subtask.',
      inputSchema: z.object({ subtaskId: id, userId: id }),
    },
    async (args) =>
      run(NovaTool.unassignSubtask, async () => {
        await deps.access.assertSubtask(
          user.id,
          args.subtaskId,
          TASK_WRITE_ROLES,
        );
        return deps.subtasks.unassignSubtask(
          user.id,
          args.subtaskId,
          args.userId,
        );
      })(),
  );

  server.registerTool(
    NovaTool.createTaskComment,
    {
      description: 'Comment on a task. Viewers cannot comment.',
      inputSchema: z.object({
        taskId: z.string().uuid(),
        content: z.string().min(1),
      }),
    },
    async (args) =>
      run(NovaTool.createTaskComment, async () => {
        const dto = await parseDto(CreateTaskCommentDto, args);
        await deps.access.assertTask(user.id, dto.taskId, TASK_WRITE_ROLES);
        return deps.comments.create(user.id, dto);
      })(),
  );

  server.registerTool(
    NovaTool.replyTaskComment,
    {
      description: 'Reply to an open task comment. Owners and admins only.',
      inputSchema: z.object({
        commentId: id,
        replyContent: z.string().min(1),
      }),
    },
    async (args) =>
      run(NovaTool.replyTaskComment, async () => {
        const dto = await parseDto(ReplyTaskCommentDto, {
          replyContent: args.replyContent,
        });
        await deps.access.assertComment(
          user.id,
          args.commentId,
          COMMENT_MODERATE_ROLES,
        );
        return deps.comments.reply(args.commentId, user.id, dto);
      })(),
  );

  server.registerTool(
    NovaTool.closeTaskComment,
    {
      description: 'Close a task comment. Owners and admins only.',
      inputSchema: z.object({ commentId: id }),
    },
    async (args) =>
      run(NovaTool.closeTaskComment, async () => {
        await deps.access.assertComment(
          user.id,
          args.commentId,
          COMMENT_MODERATE_ROLES,
        );
        return deps.comments.close(args.commentId, user.id);
      })(),
  );
}

function taskIdsOf(dto: AssignTasksDto) {
  if (dto.assignments?.length) {
    return [...new Set(dto.assignments.flatMap((item) => item.taskIds))];
  }
  return dto.taskIds ?? [];
}

function subtaskIdsOf(dto: AssignSubtasksDto) {
  if (dto.assignments?.length) {
    return [...new Set(dto.assignments.flatMap((item) => item.subtaskIds))];
  }
  return dto.subtaskIds ?? [];
}
