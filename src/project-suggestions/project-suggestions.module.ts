import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { ProjectSuggestionsController } from './project-suggestions.controller';
import { ProjectSuggestionsService } from './project-suggestions.service';

@Module({
  imports: [NotificationsModule, TasksModule],
  controllers: [ProjectSuggestionsController],
  providers: [ProjectSuggestionsService],
})
export class ProjectSuggestionsModule {}
