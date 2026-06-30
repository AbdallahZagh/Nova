import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateWhiteboardDto {
  @ApiProperty({
    description:
      'Whiteboard content: canvas, strokes (raw points only), and semantic regions',
  })
  @IsObject()
  documentJson: Record<string, unknown>;

  @ApiProperty({ description: 'Client version for optimistic concurrency' })
  @IsInt()
  @Min(1)
  version: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
