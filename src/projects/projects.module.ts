import { Module } from '@nestjs/common';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [MailModule, NotificationsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectRoleGuard],
})
export class ProjectsModule {}
