import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { SearchService } from './search.service';

type AuthenticatedRequest = {
  user: AuthUser;
};

@ApiTags('Search')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller(['search', 'api/search'])
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Search projects, tasks, whiteboards, and users',
    description:
      'Runs a secure global omnisearch across projects, tasks, whiteboards, and users for the authenticated user.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search term' })
  @ApiResponse({
    status: 200,
    description: 'Omnisearch results grouped by resource type',
    schema: {
      example: {
        projects: [{ id: 'project-id', name: 'Nova' }],
        tasks: [
          {
            id: 'task-id',
            title: 'Build omnisearch',
            projectId: 'project-id',
            project: { name: 'Nova' },
          },
        ],
        users: [
          {
            id: 'user-id',
            name: 'Sarah Johnson',
            email: 'sarah.johnson@devteam.io',
            username: 'sarah',
          },
        ],
        whiteboards: [
          {
            id: 'whiteboard-id',
            title: 'Sprint planning',
            projectId: 'project-id',
            project: { id: 'project-id', name: 'Nova' },
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  search(@Req() request: AuthenticatedRequest, @Query('q') query?: string) {
    return this.searchService.search(request.user.id, query);
  }
}
