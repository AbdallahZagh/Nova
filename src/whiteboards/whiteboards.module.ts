import { Module } from '@nestjs/common';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { StorageModule } from '../storage/storage.module';
import { WhiteboardsController } from './whiteboards.controller';
import { WhiteboardsService } from './whiteboards.service';

@Module({
  imports: [StorageModule],
  controllers: [WhiteboardsController],
  providers: [WhiteboardsService, ProjectRoleGuard],
  exports: [WhiteboardsService],
})
export class WhiteboardsModule {}
