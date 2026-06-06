import { Module } from '@nestjs/common';
import { ProjectSuggestionsController } from './project-suggestions.controller';
import { ProjectSuggestionsService } from './project-suggestions.service';

@Module({
  controllers: [ProjectSuggestionsController],
  providers: [ProjectSuggestionsService],
})
export class ProjectSuggestionsModule {}
