import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GenerateTaskSuggestionDto {
  @ApiProperty({
    example: 'Build a project analytics dashboard',
    description: 'Task title to analyze and expand into structured task data',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title: string;
}
