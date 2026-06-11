import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectSuggestionsController } from './project-suggestions.controller';
import { ProjectSuggestionsService } from './project-suggestions.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ProjectSuggestionsController],
  providers: [ProjectSuggestionsService],
})
export class ProjectSuggestionsModule {}
