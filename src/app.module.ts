import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpLoggerMiddleware } from './common/http-logger.middleware';
import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DemoModule } from './demo/demo.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { ProjectSuggestionsModule } from './project-suggestions/project-suggestions.module';
import { SearchModule } from './search/search.module';
import { SubtasksModule } from './subtasks/subtasks.module';
import { SupportModule } from './support/support.module';
import { SystemModule } from './system/system.module';
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
    SystemModule,
    DemoModule,
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
    SupportModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService, HttpLoggerMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}
