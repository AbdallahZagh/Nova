import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ApplyWhiteboardOpsDto {
  @ApiPropertyOptional({
    description: 'Strokes to insert or replace by id (raw points only)',
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  addedStrokes?: unknown[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removedStrokeIds?: string[];

  @ApiPropertyOptional({
    description: 'Semantic regions to insert or replace by id',
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  addedRegions?: unknown[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removedRegionIds?: string[];

  @ApiPropertyOptional({
    description: 'Replace canvas size',
    example: { width: 2000, height: 1500 },
  })
  @IsOptional()
  @IsObject()
  canvas?: { width: number; height: number };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
