import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'sarah.johnson@devteam.io',
    description: 'Valid email address — used as the unique login identifier',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    example: 'SecureP@ss123',
    description: 'Account password — minimum 8 characters. Store only the hash, never plaintext.',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @ApiProperty({
    example: 'Sarah Johnson',
    description: 'User full name shown across project boards and activity feeds',
  })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  fullName: string;

  @ApiPropertyOptional({
    example: 'Senior Frontend Engineer',
    description: 'Professional title displayed on the user card (e.g. Lead Backend, Product Designer)',
  })
  @IsOptional()
  @IsString()
  roleTitle?: string;
}
