import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UserSearchDto {
  @ApiPropertyOptional({
    example: 'sarah',
    description: 'Search term',
  })
  @IsOptional()
  @IsString()
  q?: string;
}
