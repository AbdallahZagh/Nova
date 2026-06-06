import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
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
import { AssignSubtasksDto } from './dto/assign-subtasks.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { SubtasksService } from './subtasks.service';

@ApiTags('Subtasks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/subtasks')
export class SubtasksController {
  constructor(private readonly subtasksService: SubtasksService) {}

  @Post()
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @ApiOperation({
    summary: 'Add a checklist item to a task',
    description:
      'Creates a new subtask under the given task ID. The item is initialised with isCompleted: false.',
  })
  @ApiResponse({
    status: 201,
    description: 'Subtask created with isCompleted set to false',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed — taskId must be a valid UUID and title must not be empty',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  create(@Body() dto: CreateSubtaskDto) {
    return this.subtasksService.create(dto);
  }

  @Post('assign')
  @ApiOperation({
    summary: 'Assign one or more subtasks to project users',
    description:
      'Assigns subtasks to users. Each assignee must be an OWNER, ADMIN, or MEMBER in the parent project. VIEWER users cannot be assigned.',
  })
  @ApiBody({ type: AssignSubtasksDto })
  @ApiResponse({ status: 201, description: 'Updated subtasks with assignees' })
  @ApiResponse({
    status: 400,
    description: 'Invalid assignment or viewer assignee',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Current user cannot assign subtasks in this project',
  })
  assignSubtasks(
    @CurrentUser('id') actorId: string,
    @Body() dto: AssignSubtasksDto,
  ) {
    return this.subtasksService.assignSubtasks(actorId, dto);
  }

  @Patch(':id')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @ApiOperation({
    summary: 'Update a checklist item',
    description:
      'Partially updates the subtask title and/or toggles the isCompleted flag.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Subtask UUID',
  })
  @ApiResponse({ status: 200, description: 'Subtask updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'Subtask not found' })
  update(@Param('id') id: string, @Body() dto: UpdateSubtaskDto) {
    return this.subtasksService.update(id, dto);
  }

  @Delete(':id/assignees/:userId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remove a user assignment from a subtask',
    description:
      'Removes one user from a subtask assignment without deleting the subtask itself.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Subtask UUID',
  })
  @ApiParam({
    name: 'userId',
    example: 'f2884fdb-6279-42e7-b2cf-f5f7ff7ade17',
    description: 'User UUID to remove from this subtask',
  })
  @ApiResponse({ status: 200, description: 'Updated subtask with assignees' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Current user cannot assign subtasks in this project',
  })
  @ApiResponse({ status: 404, description: 'Subtask assignment not found' })
  unassignSubtask(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.subtasksService.unassignSubtask(actorId, id, userId);
  }

  @Delete(':id')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a checklist item',
    description: 'Permanently removes the subtask from the database.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Subtask UUID',
  })
  @ApiResponse({ status: 200, description: 'Subtask deleted successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'Subtask not found' })
  remove(@Param('id') id: string) {
    return this.subtasksService.remove(id);
  }
}
