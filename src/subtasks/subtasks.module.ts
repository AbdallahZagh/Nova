import { Module } from '@nestjs/common';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { SubtasksController } from './subtasks.controller';
import { SubtasksService } from './subtasks.service';

@Module({
  controllers: [SubtasksController],
  providers: [SubtasksService, ProjectRoleGuard],
})
export class SubtasksModule {}
