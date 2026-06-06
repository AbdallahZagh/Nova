import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'sarah.johnson@devteam.io',
    description: 'Email address of the account whose password is being reset',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    example: '482910',
    description:
      '6-digit OTP code previously issued via the forgot-password flow',
  })
  @IsString()
  @Length(6, 6, { message: 'Reset code must be exactly 6 digits' })
  code: string;

  @ApiProperty({
    example: 'NewSecureP@ss456',
    description: 'New password to set — minimum 8 characters',
  })
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long' })
  newPassword: string;
}
