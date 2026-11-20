import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class WindowsChannelDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  channel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  previousChannel?: string;
}
