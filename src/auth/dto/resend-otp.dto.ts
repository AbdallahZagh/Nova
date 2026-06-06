import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn } from 'class-validator';

export class ResendOtpDto {
  @ApiProperty({
    example: 'sarah.johnson@devteam.io',
    description: 'Email address to issue a fresh OTP to',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    example: 'REGISTER',
    enum: ['REGISTER', 'FORGOT_PASSWORD', 'REACTIVATE'],
    description: 'OTP purpose to resend',
  })
  @IsIn(['REGISTER', 'FORGOT_PASSWORD', 'REACTIVATE'], {
    message: 'purpose must be REGISTER, FORGOT_PASSWORD, or REACTIVATE',
  })
  purpose: 'REGISTER' | 'FORGOT_PASSWORD' | 'REACTIVATE';
}
