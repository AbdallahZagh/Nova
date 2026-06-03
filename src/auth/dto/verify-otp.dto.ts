import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    example: 'sarah.johnson@devteam.io',
    description: 'Email address the OTP was issued to',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    example: '482910',
    description: 'The 6-digit one-time code sent to the user',
  })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  code: string;

  @ApiProperty({
    example: 'REGISTER',
    enum: ['REGISTER', 'FORGOT_PASSWORD', 'REACTIVATE'],
    description:
      'Context in which the OTP was issued.\n' +
      '- REGISTER → activates a brand-new account\n' +
      '- FORGOT_PASSWORD → clears the path to reset the password\n' +
      '- REACTIVATE → restores a deactivated/archived account',
  })
  @IsIn(['REGISTER', 'FORGOT_PASSWORD', 'REACTIVATE'], {
    message: 'purpose must be REGISTER, FORGOT_PASSWORD, or REACTIVATE',
  })
  purpose: 'REGISTER' | 'FORGOT_PASSWORD' | 'REACTIVATE';
}
