import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProjectSuggestionStatus } from './create-project-suggestion.dto';

export class UpdateProjectSuggestionDto {
  @ApiPropertyOptional({
    example: 'Add a shared project notes tab with pinned decisions.',
    description: 'Updated suggestion text',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    example: 'In Progress',
    enum: ProjectSuggestionStatus,
    description: 'Updated workflow status for the suggestion',
  })
  @IsOptional()
  @IsEnum(ProjectSuggestionStatus)
  status?: ProjectSuggestionStatus;
}
