import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'sarah.johnson@devteam.io',
    description: 'Email address associated with the account to recover',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}
