import {
  Body,
  Controller,
  Delete,
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
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new task card',
    description:
      'Creates a task linked to the specified project. Status defaults to "To Do" and priority to "Medium" ' +
      'when not explicitly provided. An optional subtasks array creates checklist items atomically.',
  })
  @ApiResponse({ status: 201, description: 'Task created with subtasks and assignee included' })
  @ApiResponse({ status: 400, description: 'Validation failed — check enum values and required fields' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(userId, dto);
  }

  @Get('project/:projectId')
  @ApiOperation({
    summary: 'Get all tasks for a project board',
    description:
      'Returns every task card for a given project. Each task includes createdAt, updatedAt, ' +
      'subtasks, assignee, full activities log, and lastActivity (most recent change).',
  })
  @ApiParam({
    name: 'projectId',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the parent project',
  })
  @ApiResponse({
    status: 200,
    description: 'Task list with subtasks, assignees, and activity history',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  findByProject(@Param('projectId') projectId: string) {
    return this.tasksService.findByProject(projectId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a task card',
    description:
      'Partially updates task fields. Changes to status, assignee, priority, title, description, or due date ' +
      'are automatically logged to task_activities with the actor and timestamp.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Task UUID',
  })
  @ApiResponse({
    status: 200,
    description:
      'Task updated with createdAt, updatedAt, activities[], and lastActivity.',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a task card',
    description:
      'Permanently removes the task and cascades to all its subtasks and activity log entries.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Task UUID',
  })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
