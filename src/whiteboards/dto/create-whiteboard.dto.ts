import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateWhiteboardDto {
  @ApiPropertyOptional({ description: 'Optional project to attach the board to' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ example: 'Sprint planning board' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
