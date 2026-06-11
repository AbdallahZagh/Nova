import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateSubtaskDto {
  @ApiPropertyOptional({
    example: 'Configure CORS middleware for all origins',
    description: 'Updated checklist item title',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Toggle the completion state of this checklist item',
  })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({
    example: '2026-06-30T00:00:00.000Z',
    description: 'Optional deadline in ISO 8601 format',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
