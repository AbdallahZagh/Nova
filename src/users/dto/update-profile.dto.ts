import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';
import { IsUsername } from '../../common/validators/is-username.decorator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Sarah Johnson',
    description: 'Full display name shown across the dashboard and project boards',
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    example: '@abdallah_zagh',
    description:
      'Unique handle starting with @ — lowercase letters, numbers, and underscores only (no spaces)',
  })
  @IsOptional()
  @IsString()
  @IsUsername()
  username?: string;

  @ApiPropertyOptional({
    example: 'Senior Frontend Engineer',
    description: 'Professional title displayed on the user card (e.g. Lead Backend, Product Designer)',
  })
  @IsOptional()
  @IsString()
  roleTitle?: string;

  @ApiPropertyOptional({
    example: 'Full-stack engineer passionate about developer tooling and distributed systems. Open-source contributor.',
    description: 'Short bio or about-me text visible on the profile page',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    example: 'https://avatars.githubusercontent.com/u/9876543',
    description: 'Publicly accessible URL to the user profile photo (HTTPS required)',
  })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
