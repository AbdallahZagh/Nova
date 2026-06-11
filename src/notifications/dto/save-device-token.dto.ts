import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SaveDeviceTokenDto {
  @ApiProperty({
    example: 'fcm-registration-token',
    description: 'Firebase Cloud Messaging registration token for this device',
  })
  @IsString()
  @MinLength(10)
  token: string;

  @ApiPropertyOptional({
    example: 'web',
    description: 'Optional platform label such as web, ios, android, desktop',
  })
  @IsOptional()
  @IsString()
  platform?: string;
}
