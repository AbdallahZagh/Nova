import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateWhiteboardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description:
      'When true, admins skip the exit prompt and a cover snapshot is saved in the background.',
  })
  @IsOptional()
  @IsBoolean()
  autoSaveSnapshotOnExit?: boolean;
}
