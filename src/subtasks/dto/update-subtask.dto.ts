import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

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
}
