import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSubtaskDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the parent task this checklist item belongs to',
  })
  @IsUUID()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({
    example: 'Configure CORS middleware',
    description: 'Short checklist item title displayed in the task side-drawer',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: '2026-06-30T00:00:00.000Z',
    required: false,
    description: 'Optional deadline in ISO 8601 format',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
