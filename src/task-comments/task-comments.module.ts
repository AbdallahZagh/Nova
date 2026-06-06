import { Module } from '@nestjs/common';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { TaskCommentsController } from './task-comments.controller';
import { TaskCommentsService } from './task-comments.service';

@Module({
  controllers: [TaskCommentsController],
  providers: [TaskCommentsService, ProjectRoleGuard],
})
export class TaskCommentsModule {}
