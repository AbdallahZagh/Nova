import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { TaskPriority, TaskStatus } from './create-task.dto';

export class UpdateTaskDto {
  @ApiPropertyOptional({
    example: 'Design system tokens audit — phase 2',
    description: 'Updated task title',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'Extend the audit to cover motion and shadow tokens.',
    description: 'Updated task description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'In Review',
    enum: TaskStatus,
    description:
      'New kanban column status. Changing this field automatically writes a STATUS_CHANGE entry to the task_activities log.',
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    example: 'Critical',
    enum: TaskPriority,
    description: 'Updated priority weight for sorting and alerting',
  })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    example: '2026-07-15T00:00:00.000Z',
    description: 'Updated deadline in ISO 8601 format',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    example: '2026-06-01T12:00:00.000Z',
    description: 'Explicit completion timestamp (auto-set when status changes to Completed if omitted)',
  })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the newly assigned team member',
  })
  @IsOptional()
  @IsString()
  assigneeId?: string;
}
