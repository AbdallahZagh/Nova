import { Module } from '@nestjs/common';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService, ProjectRoleGuard],
})
export class TasksModule {}
