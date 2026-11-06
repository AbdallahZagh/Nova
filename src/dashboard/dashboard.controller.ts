import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Fetch the full dashboard in one request',
    description:
      'Runs metrics, activity, urgent tasks, the continue strip, and upcoming subscriptions in parallel.',
  })
  @ApiResponse({
    status: 200,
    description: 'Combined dashboard payload',
    schema: {
      example: {
        metrics: {
          tasksDueToday: 3,
          activeProjectsCount: 5,
          productivityPercentage: 60,
          _meta: {
            totalSubtasks: 10,
            completedSubtasks: 6,
            totalTasks: 12,
          },
        },
        activity: {
          '2026-05-28': [
            {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              title: 'Build Dashboard API',
              status: 'Completed',
              dueDate: '2026-05-28',
              projectId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
              projectName: 'Nova Core',
              completionPercentage: 100,
            },
          ],
        },
        urgentTasks: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: 'Write launch checklist',
            projectId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            projectName: 'Aurora Launch',
            priority: 'High',
            dueDate: '2026-08-15T00:00:00.000Z',
            dueLabel: 'Today',
          },
        ],
        continue: {
          lastProject: {
            id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            name: 'Aurora Launch',
            status: 'Active',
            updatedAt: '2026-08-14T18:00:00.000Z',
          },
          lastWhiteboard: {
            id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
            title: 'Sprint board',
            projectId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            lastEditedAt: '2026-08-14T17:30:00.000Z',
          },
          dueToday: [],
        },
        subscriptions: {
          dueIn30Days: [{ currency: 'USD', amount: '20.00' }],
          next: {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            service: 'Figma',
            plan: 'Professional',
            amount: '20.00',
            currency: 'USD',
            nextChargeAt: '2026-11-20T12:00:00.000Z',
            trialEndsAt: null,
            daysUntilCharge: 14,
            inWarningWindow: false,
            status: 'ACTIVE',
          },
          upcoming: [
            {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              service: 'Figma',
              plan: 'Professional',
              amount: '20.00',
              currency: 'USD',
              nextChargeAt: '2026-11-20T12:00:00.000Z',
              trialEndsAt: null,
              daysUntilCharge: 14,
              inWarningWindow: false,
              status: 'ACTIVE',
            },
          ],
          alerts: [],
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  getSummary(@CurrentUser('id') userId: string) {
    return this.dashboardService.getSummary(userId);
  }
}
