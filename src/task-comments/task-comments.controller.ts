import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ProjectRole,
  RequireProjectRole,
} from '../common/decorators/require-project-role.decorator';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { ReplyTaskCommentDto } from './dto/reply-task-comment.dto';
import { TaskCommentsService } from './task-comments.service';

@ApiTags('Task Comments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/task-comments')
export class TaskCommentsController {
  constructor(private readonly taskCommentsService: TaskCommentsService) {}

  @Post()
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @ApiOperation({
    summary: 'Add a comment to a task',
    description:
      'Allows project owners, admins, and members to comment on a task. Viewers cannot comment.',
  })
  @ApiResponse({ status: 201, description: 'Task comment created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'You do not have permission to comment on this task' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTaskCommentDto,
  ) {
    return this.taskCommentsService.create(userId, dto);
  }

  @Get('task/:taskId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER, ProjectRole.VIEWER)
  @ApiOperation({
    summary: 'List comments for a task',
    description: 'Returns all comments for a task, including admin replies and close metadata.',
  })
  @ApiParam({
    name: 'taskId',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Task UUID',
  })
  @ApiResponse({ status: 200, description: 'Task comments returned' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'You do not have access to this task' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  findByTask(@Param('taskId') taskId: string) {
    return this.taskCommentsService.findByTask(taskId);
  }

  @Patch(':id/reply')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({
    summary: 'Reply to a task comment',
    description:
      'Allows project owners and admins to reply to an open task comment. Closed comments cannot be changed.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Task comment UUID',
  })
  @ApiResponse({ status: 200, description: 'Task comment replied to' })
  @ApiResponse({ status: 400, description: 'Comment is closed or validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Only project owners or admins can reply' })
  @ApiResponse({ status: 404, description: 'Task comment not found' })
  reply(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReplyTaskCommentDto,
  ) {
    return this.taskCommentsService.reply(id, userId, dto);
  }

  @Patch(':id/close')
  @HttpCode(200)
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({
    summary: 'Close a task comment',
    description:
      'Allows project owners and admins to close an open task comment. Closed comments become read-only.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Task comment UUID',
  })
  @ApiResponse({ status: 200, description: 'Task comment closed' })
  @ApiResponse({ status: 400, description: 'Comment is already closed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Only project owners or admins can close' })
  @ApiResponse({ status: 404, description: 'Task comment not found' })
  close(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.taskCommentsService.close(id, userId);
  }
}
