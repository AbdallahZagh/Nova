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
    summary: 'Fetch tasks mapped for the Gantt calendar window',
    description:
      'Returns tasks whose due date falls inside the requested calendar window, ' +
      'ordered by deadline ascending. Bars are due-date anchored (there is no stored start date).\n\n' +
      '**projectId** (optional) — filter to a single project board. Omit to see tasks across all your projects.\n\n' +
      '**tzOffsetMinutes** (optional) — `Date#getTimezoneOffset()` from the client so today/week/month match the Gantt.\n\n' +
      '**filter** (optional, default: `monthly`) — calendar window in the caller timezone:\n' +
      '- `today` — that calendar day\n' +
      '- `tomorrow` — the next calendar day\n' +
      '- `weekly` — Monday through Sunday containing today\n' +
      '- `monthly` — 1st through last day of the current month (default)\n' +
      '- `yearly` — January 1 through December 31 of the current year',
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description:
      'UUID of a specific project to scope the timeline to. Omit to see all your projects.',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['today', 'tomorrow', 'weekly', 'monthly', 'yearly'],
    example: 'weekly',
    description:
      'Calendar window for the Gantt grid. Defaults to the current calendar month.',
  })
  @ApiQuery({
    name: 'tzOffsetMinutes',
    required: false,
    example: '-180',
    description:
      'Minutes returned by Date.getTimezoneOffset() in the client timezone (UTC+3 → -180).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Task list scoped to the calendar window. ' +
      'Each item: { id, title, description, status, priority, startDate, dueDate, completedAt, overdue, project, assignee, windowStart, windowEnd, windowLabel }',
    schema: {
      example: [
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: 'Design system tokens audit',
          description: null,
          status: 'In Progress',
          priority: 'High',
          startDate: '2026-08-15T21:00:00.000Z',
          dueDate: '2026-08-15T21:00:00.000Z',
          completedAt: null,
          overdue: false,
          project: { id: 'uuid', name: 'Nova Dashboard v2' },
          assignee: {
            id: 'uuid',
            fullName: 'Jane Doe',
            avatarUrl: null,
            roleTitle: 'Designer',
          },
          windowStart: '2026-08-09T21:00:00.000Z',
          windowEnd: '2026-08-16T20:59:59.999Z',
          windowLabel: 'This week',
        },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid filter value' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'No access to the requested project' })
  getTimeline(
    @CurrentUser('id') userId: string,
    @Query('projectId') projectId?: string,
    @Query('filter') filter?: string,
    @Query('tzOffsetMinutes') tzOffsetMinutes?: string,
  ) {
    return this.timelineService.getProjectTimeline(
      userId,
      projectId,
      filter,
      tzOffsetMinutes,
    );
  }
}
