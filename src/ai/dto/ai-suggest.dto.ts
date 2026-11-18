import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AiSuggestDto {
  @ApiProperty({
    example: 'Build a project analytics dashboard',
    description: 'Task title to analyze and expand into structured task data',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150, { message: 'Title is too long for analysis' })
  title: string;

  @ApiPropertyOptional({
    description: 'The description already saved on the task, when suggesting an update',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Checklist titles already on the task, so the suggestion does not repeat them',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  existingSubtasks?: string[];
}
