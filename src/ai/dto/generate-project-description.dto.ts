import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GenerateProjectDescriptionDto {
  @ApiProperty({
    example: 'Nova Analytics Dashboard',
    description: 'Project title to expand into a concise project description',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title: string;
}
