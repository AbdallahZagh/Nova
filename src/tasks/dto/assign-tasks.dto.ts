import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class TaskAssignmentInputDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the project user to assign tasks to',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Task UUIDs to assign to this user',
    example: [
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  taskIds: string[];
}

export class AssignTasksDto {
  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the project user to assign tasks to. Used for single-user requests.',
  })
  @ValidateIf((dto: AssignTasksDto) => !dto.assignments?.length)
  @IsUUID()
  @IsNotEmpty()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Task UUIDs to assign to userId. Used for single-user requests.',
    example: [
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    ],
  })
  @ValidateIf((dto: AssignTasksDto) => !dto.assignments?.length)
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  taskIds?: string[];

  @ApiPropertyOptional({
    description:
      'Optional bulk payload. Each item assigns multiple tasks to one user.',
    type: [TaskAssignmentInputDto],
    example: [
      {
        userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        taskIds: [
          'c3d4e5f6-a7b8-9012-cdef-123456789012',
          'd4e5f6a7-b890-1234-def1-234567890123',
        ],
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => TaskAssignmentInputDto)
  assignments?: TaskAssignmentInputDto[];
}
