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
import {
  ProjectRole,
  RequireProjectRole,
} from '../common/decorators/require-project-role.decorator';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
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
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({
    summary: 'Update project details',
    description: 'Partially updates project fields. Owners and admins may make changes.',
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
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER)
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

  @Post(':id/members')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({
    summary: 'Add one or more members to a project',
    description:
      'Adds one user with { userId, role } or multiple users with { members: [{ userId, role }] }.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project UUID',
  })
  @ApiResponse({ status: 201, description: 'Project member or members added' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'You do not have permission to manage members' })
  @ApiResponse({ status: 404, description: 'Project or user not found' })
  addMember(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.projectsService.addMember(actorId, id, dto);
  }

  @Patch(':id/members/:userId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({
    summary: 'Update a project member role',
    description:
      'Updates a member role. Admins cannot demote or modify project owners.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project UUID',
  })
  @ApiParam({
    name: 'userId',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'User UUID',
  })
  @ApiResponse({ status: 200, description: 'Project member role updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'You do not have permission to update this member' })
  @ApiResponse({ status: 404, description: 'Project member not found' })
  updateMember(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateProjectMemberDto,
  ) {
    return this.projectsService.updateMember(actorId, id, userId, dto);
  }

  @Delete(':id/members/:userId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN)
  @ApiOperation({
    summary: 'Remove a member from a project',
    description:
      'Removes a user from project membership. Admins cannot remove project owners.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project UUID',
  })
  @ApiParam({
    name: 'userId',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'User UUID',
  })
  @ApiResponse({ status: 200, description: 'Project member removed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'You do not have permission to remove this member' })
  @ApiResponse({ status: 404, description: 'Project member not found' })
  removeMember(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.projectsService.removeMember(actorId, id, userId);
  }
}
