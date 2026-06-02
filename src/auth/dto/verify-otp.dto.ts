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
    enum: ['REGISTER', 'FORGOT_PASSWORD'],
    description:
      'Context in which the OTP was issued. REGISTER activates the account; FORGOT_PASSWORD clears the path to reset.',
  })
  @IsIn(['REGISTER', 'FORGOT_PASSWORD'], {
    message: 'purpose must be REGISTER or FORGOT_PASSWORD',
  })
  purpose: 'REGISTER' | 'FORGOT_PASSWORD';
}
