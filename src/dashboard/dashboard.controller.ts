import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UrgentTaskResponseDto } from './dto/urgent-task-response.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  @ApiOperation({
    summary: 'Fetch global productivity metrics for the logged-in user',
    description:
      'Returns three KPI values used by the dashboard header card strip:\n\n' +
      '- **tasksDueToday** — tasks assigned to the user where dueDate falls on the current calendar day.\n' +
      '- **activeProjectsCount** — projects with status "Active" that the user owns or is a member of.\n' +
      '- **productivityPercentage** — subtask-based completion rate across all assigned tasks ' +
      '(completedSubtasks / totalSubtasks × 100). Falls back to main-task Completed ratio when no subtasks exist.\n\n' +
      'Raw counts are also returned under `_meta` so the frontend can render denominator labels.',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated KPI metrics',
    schema: {
      example: {
        tasksDueToday: 3,
        activeProjectsCount: 5,
        productivityPercentage: 60,
        _meta: {
          totalSubtasks: 10,
          completedSubtasks: 6,
          totalAssignedTasks: 12,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  getMetrics(@CurrentUser('id') userId: string) {
    return this.dashboardService.getMetrics(userId);
  }

  @Get('activity')
  @ApiOperation({
    summary: 'Fetch chronological task activity for the GitHub-style heatmap calendar',
    description:
      'Returns all tasks assigned to the user from the trailing 12-month window, ' +
      'grouped into an ISO date-keyed map (`YYYY-MM-DD → task[]`).\n\n' +
      '**Date resolution priority per task:**\n' +
      '1. `completedAt` — if the task is finished (most accurate reflection of *when* work was done)\n' +
      '2. `dueDate` — if the task is still open and has a deadline\n' +
      '3. `createdAt` — fallback so every task always appears somewhere on the grid\n\n' +
      '**`completionPercentage` per entry:**\n' +
      '- Task has subtasks → `completedSubtasks / totalSubtasks × 100` (one decimal)\n' +
      '- No subtasks → `100` if status is Completed, else `0`',
  })
  @ApiResponse({
    status: 200,
    description:
      'ISO date → task array map. Each entry contains id, title, status, dueDate, projectName, and completionPercentage.',
    schema: {
      example: {
        '2026-05-28': [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: 'Build Dashboard API',
            status: 'Completed',
            dueDate: '2026-05-28',
            projectName: 'Nova Core',
            completionPercentage: 100,
          },
        ],
        '2026-05-31': [
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            title: 'Design system tokens audit',
            status: 'In Progress',
            dueDate: '2026-06-05',
            projectName: 'Nova Dashboard v2',
            completionPercentage: 33.3,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  getActivity(@CurrentUser('id') userId: string) {
    return this.dashboardService.getActivity(userId);
  }

  @Get('urgent-tasks')
  @ApiOperation({
    summary: 'Fetch a limited list of upcoming or overdue tasks',
    description:
      'Returns up to 6 incomplete tasks assigned to the user that have a due date, ' +
      'sorted by dueDate ascending so the most overdue / most imminent tasks appear first. ' +
      'Each item includes a pre-computed `dueLabel` string for direct tooltip / badge rendering ' +
      '(e.g. "2d overdue", "Today", "Tomorrow", "In 5 days").',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of up to 6 urgent task objects ordered by soonest due date',
    type: [UrgentTaskResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  getUrgentTasks(@CurrentUser('id') userId: string) {
    return this.dashboardService.getUrgentTasks(userId);
  }
}
