import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum ProjectSuggestionStatus {
  IN_REVIEW = 'In Review',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
  REJECTED = 'Rejected',
}

export class CreateProjectSuggestionDto {
  @ApiProperty({
    example: 'Add a shared project notes tab for design decisions.',
    description: 'Comment or suggestion text attached to the project',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the project this suggestion belongs to',
  })
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @ApiPropertyOptional({
    example: 'In Review',
    enum: ProjectSuggestionStatus,
    default: ProjectSuggestionStatus.IN_REVIEW,
    description: 'Workflow status for the suggestion. Defaults to "In Review".',
  })
  @IsOptional()
  @IsEnum(ProjectSuggestionStatus)
  status?: ProjectSuggestionStatus;
}
