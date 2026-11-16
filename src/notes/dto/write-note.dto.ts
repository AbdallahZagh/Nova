import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { NOTE_COLORS } from '../note.logic';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === null) return null;
  return value;
}

export class WriteNoteDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @ApiPropertyOptional({ enum: NOTE_COLORS })
  @IsOptional()
  @IsIn(NOTE_COLORS)
  color?: (typeof NOTE_COLORS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  floating?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ description: 'Left offset of the on-screen sticky in px' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20000)
  posX?: number;

  @ApiPropertyOptional({ description: 'Top offset of the on-screen sticky in px' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20000)
  posY?: number;

  @ApiPropertyOptional({ description: 'Width of the on-screen sticky in px' })
  @IsOptional()
  @IsNumber()
  @Min(200)
  @Max(1400)
  width?: number;

  @ApiPropertyOptional({ description: 'Height of the on-screen sticky in px' })
  @IsOptional()
  @IsNumber()
  @Min(120)
  @Max(1400)
  height?: number;

  @ApiPropertyOptional({ type: 'array' })
  @IsOptional()
  checklist?: unknown;
}
