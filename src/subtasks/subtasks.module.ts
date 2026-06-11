import { Module } from '@nestjs/common';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubtasksController } from './subtasks.controller';
import { SubtasksService } from './subtasks.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SubtasksController],
  providers: [SubtasksService, ProjectRoleGuard],
})
export class SubtasksModule {}
