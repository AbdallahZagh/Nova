import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateWhiteboardCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  x?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  y?: number;
}
