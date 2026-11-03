import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OAuthModule } from '../oauth/oauth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ProjectsModule } from '../projects/projects.module';
import { SearchModule } from '../search/search.module';
import { SubtasksModule } from '../subtasks/subtasks.module';
import { TaskCommentsModule } from '../task-comments/task-comments.module';
import { TasksModule } from '../tasks/tasks.module';
import { McpAccessService } from './mcp-access';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpController } from './mcp.controller';
import { NovaMcpServerFactory } from './nova-mcp.server';

@Module({
  imports: [
    AuthModule,
    OAuthModule,
    ProjectsModule,
    TasksModule,
    SubtasksModule,
    TaskCommentsModule,
    SearchModule,
    DashboardModule,
  ],
  controllers: [McpController],
  providers: [McpAccessService, NovaMcpServerFactory, McpAuthGuard],
})
export class McpModule {}
