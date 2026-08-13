import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { ProjectSuggestionsModule } from './project-suggestions/project-suggestions.module';
import { SearchModule } from './search/search.module';
import { SubtasksModule } from './subtasks/subtasks.module';
import { TaskCommentsModule } from './task-comments/task-comments.module';
import { TasksModule } from './tasks/tasks.module';
import { TimelineModule } from './timeline/timeline.module';
import { UsersModule } from './users/users.module';
import { WhiteboardsModule } from './whiteboards/whiteboards.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    ScheduleModule.forRoot(),
    StorageModule,
    AiModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    ProjectSuggestionsModule,
    TasksModule,
    TaskCommentsModule,
    SubtasksModule,
    SearchModule,
    TimelineModule,
    DashboardModule,
    WhiteboardsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
