import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum TaskStatus {
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  IN_REVIEW = 'In Review',
  COMPLETED = 'Completed',
}

export enum TaskPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

/**
 * Represents a single checklist row supplied at task-creation time.
 * Does NOT include taskId — the parent task ID is inferred from the
 * Prisma nested write and does not need to be sent by the client.
 */
export class SubtaskItemDto {
  @ApiProperty({
    example: 'Setup database index keys',
    description:
      'Checklist item title. isCompleted is always initialised to false.',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example: '2026-06-30T00:00:00.000Z',
    description: 'Optional subtask deadline in ISO 8601 format',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class CreateTaskDto {
  @ApiProperty({
    example: 'Design system tokens audit',
    description: 'Task title displayed on the kanban card',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example:
      'Review all colour, spacing, and typography tokens and align with Figma variables.',
    description: 'Detailed task description shown in the task detail panel',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'In Progress',
    enum: TaskStatus,
    default: TaskStatus.TODO,
    description: 'Kanban column the card lives in. Defaults to "To Do".',
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    example: 'High',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
    description:
      'Priority weight: Low → Medium → High → Critical. Drives sorting and visual urgency indicators.',
  })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    example: '2026-06-30T00:00:00.000Z',
    description: 'Optional deadline in ISO 8601 format',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the parent project this task belongs to',
  })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the team member to assign this task to',
  })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({
    description:
      'Optional initial checklist created atomically with the task in a single Prisma transaction. ' +
      'Each item only needs a title — isCompleted is always initialised to false.',
    type: [SubtaskItemDto],
    example: [
      { title: 'Setup database index keys' },
      { title: 'Configure CORS middleware' },
      { title: 'Write unit tests for auth service' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubtaskItemDto)
  subtasks?: SubtaskItemDto[];
}
