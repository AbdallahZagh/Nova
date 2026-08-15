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
import {
  ProjectRole,
  RequireProjectRole,
} from '../common/decorators/require-project-role.decorator';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { CreateProjectSuggestionDto } from './dto/create-project-suggestion.dto';
import { UpdateProjectSuggestionDto } from './dto/update-project-suggestion.dto';
import { ProjectSuggestionsService } from './project-suggestions.service';

@ApiTags('Project Suggestions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/project-suggestions')
export class ProjectSuggestionsController {
  constructor(
    private readonly projectSuggestionsService: ProjectSuggestionsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Add a comment or suggestion to a project',
    description:
      'Creates a project suggestion. Status defaults to "In Review" when omitted.',
  })
  @ApiResponse({ status: 201, description: 'Project suggestion created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'You do not have access to this project',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProjectSuggestionDto,
  ) {
    return this.projectSuggestionsService.create(userId, dto);
  }

  @Get('project/:projectId')
  @ApiOperation({
    summary: 'List suggestions for a project',
    description:
      'Returns all comments and suggestions attached to a project, newest first.',
  })
  @ApiParam({
    name: 'projectId',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project UUID',
  })
  @ApiResponse({ status: 200, description: 'Project suggestions returned' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'You do not have access to this project',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findByProject(
    @CurrentUser('id') userId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.projectSuggestionsService.findByProject(userId, projectId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one project suggestion',
    description: 'Returns a single project suggestion by ID.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project suggestion UUID',
  })
  @ApiResponse({ status: 200, description: 'Project suggestion returned' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'You do not have access to this project',
  })
  @ApiResponse({ status: 404, description: 'Project suggestion not found' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.projectSuggestionsService.findOne(userId, id);
  }

  @Post(':id/convert-to-task')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @ApiOperation({
    summary: 'Turn a suggestion into a task',
    description:
      'Creates a To Do card from the idea and marks the suggestion In Progress.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project suggestion UUID',
  })
  @ApiResponse({ status: 201, description: 'Task created from suggestion' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Viewers cannot turn ideas into tasks',
  })
  @ApiResponse({ status: 404, description: 'Project suggestion not found' })
  convertToTask(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.projectSuggestionsService.convertToTask(userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a project suggestion',
    description:
      'Updates suggestion content and/or status. Allowed statuses are "In Review", "In Progress", "Done", and "Rejected".',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project suggestion UUID',
  })
  @ApiResponse({ status: 200, description: 'Project suggestion updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Only the suggestion author or project owner can update',
  })
  @ApiResponse({ status: 404, description: 'Project suggestion not found' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectSuggestionDto,
  ) {
    return this.projectSuggestionsService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a project suggestion',
    description:
      'Permanently removes a project suggestion. Only the suggestion author or project owner may delete it.',
  })
  @ApiParam({
    name: 'id',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Project suggestion UUID',
  })
  @ApiResponse({ status: 200, description: 'Project suggestion deleted' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Only the suggestion author or project owner can delete',
  })
  @ApiResponse({ status: 404, description: 'Project suggestion not found' })
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.projectSuggestionsService.remove(userId, id);
  }
}
