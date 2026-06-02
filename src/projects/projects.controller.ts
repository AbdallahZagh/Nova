import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new project',
    description:
      'Creates a project workspace. The requesting user is automatically set as owner.',
  })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all accessible projects',
    description:
      'Returns projects the user owns or is a member of. Each project includes createdAt, updatedAt, ' +
      'team members, and progress: totalTasks, completedTasks, totalSubtasks, completedSubtasks, completionPercentage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Project list with team members and completion percentages',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  findAll(@CurrentUser('id') userId: string) {
    return this.projectsService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get full project details',
    description:
      'Returns a single project with all task cards (each including nested subtask checklists) ' +
      'and team members. Also includes completion stats.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project UUID',
  })
  @ApiResponse({ status: 200, description: 'Project details with tasks and members' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'You do not have access to this project' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.projectsService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update project details',
    description: 'Partially updates project fields. Only the project owner may make changes.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project UUID',
  })
  @ApiResponse({ status: 200, description: 'Project updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Only the project owner can update' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a project',
    description:
      'Permanently deletes the project and cascades to all tasks, subtasks, and activity logs. ' +
      'Only the project owner can delete.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project UUID',
  })
  @ApiResponse({ status: 200, description: 'Project deleted' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Only the project owner can delete' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.projectsService.remove(userId, id);
  }
}
