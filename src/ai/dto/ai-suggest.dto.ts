import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AiSuggestDto {
  @ApiProperty({
    example: 'Build a project analytics dashboard',
    description: 'Task title to analyze and expand into structured task data',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150, { message: 'Title is too long for analysis' })
  title: string;
}
