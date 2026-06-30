import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UploadSnapshotMetaDto {
  @ApiProperty({ example: 2000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width: number;

  @ApiProperty({ example: 1500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height: number;
}
