import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
      'Returns tasks with a dueDate that fall inside the requested time window, ' +
      'ordered by deadline ascending. Each pill carries startDate, dueDate, status, priority, assignee, and project name.\n\n' +
      '**projectId** (optional) — filter to a single project board. Omit to see tasks across all your projects.\n\n' +
      '**filter** (optional, default: `monthly`) — time window:\n' +
      '- `today` — tasks due today\n' +
      '- `tomorrow` — tasks due tomorrow\n' +
      '- `weekly` — next 7 days\n' +
      '- `monthly` — next 30 days (default)\n' +
      '- `yearly` — next 365 days',
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of a specific project to scope the timeline to. Omit to see all your projects.',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['today', 'tomorrow', 'weekly', 'monthly', 'yearly'],
    example: 'weekly',
    description: 'Time window for the Gantt grid. Defaults to monthly (next 30 days).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Chronological task list scoped to the window. ' +
      'Each item: { id, title, description, status, priority, startDate, dueDate, completedAt, project, assignee, windowStart, windowEnd, windowLabel }',
    schema: {
      example: [
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: 'Design system tokens audit',
          description: null,
          status: 'In Progress',
          priority: 'High',
          startDate: '2026-06-01T10:00:00.000Z',
          dueDate: '2026-06-07T00:00:00.000Z',
          completedAt: null,
          project: { id: 'uuid', name: 'Nova Dashboard v2' },
          assignee: { id: 'uuid', fullName: 'Jane Doe', avatarUrl: null, roleTitle: 'Designer' },
          windowStart: '2026-06-03T00:00:00.000Z',
          windowEnd: '2026-06-09T23:59:59.999Z',
          windowLabel: 'This week',
        },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid filter value' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  getTimeline(
    @CurrentUser('id') userId: string,
    @Query('projectId') projectId?: string,
    @Query('filter') filter?: string,
  ) {
    return this.timelineService.getProjectTimeline(userId, projectId, filter);
  }
}
