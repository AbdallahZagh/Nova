import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum ProjectStatus {
  ACTIVE = 'Active',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  ARCHIVED = 'Archived',
}

export class CreateProjectDto {
  @ApiProperty({
    example: 'Nova Dashboard v2',
    description: 'Project display name shown on the workspace board',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'Full redesign of the analytics dashboard including new chart components and dark mode.',
    description: 'Optional detailed description of the project scope and goals',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'Active',
    enum: ProjectStatus,
    default: ProjectStatus.ACTIVE,
    description:
      'Lifecycle status of the project. Active = ongoing, In Progress = actively being worked on, Completed = shipped, Archived = frozen.',
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
