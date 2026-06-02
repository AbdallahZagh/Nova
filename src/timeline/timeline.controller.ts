import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TimelineService } from './timeline.service';

@ApiTags('Timeline')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/timeline')
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get()
  @ApiOperation({
    summary: 'Fetch chronological tasks mapped out for Gantt chart plotting',
    description:
      'Returns all tasks in a project that have a dueDate, ordered by deadline ascending. ' +
      'Each item includes a startDate (task creation timestamp) and dueDate so the frontend ' +
      'can position the task pill on the horizontal calendar grid. ' +
      'Tasks without a dueDate are excluded — they have no finite end point to render.',
  })
  @ApiQuery({
    name: 'projectId',
    required: true,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the project whose tasks should be plotted on the Gantt timeline',
  })
  @ApiResponse({
    status: 200,
    description:
      'Chronological task list. Each item: { id, title, description, status, priority, startDate, dueDate, completedAt, assignee }',
  })
  @ApiResponse({ status: 400, description: 'projectId is missing or not a valid UUID' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  getTimeline(@Query('projectId') projectId: string) {
    return this.timelineService.getProjectTimeline(projectId);
  }
}
