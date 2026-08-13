import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class TestEmailDto {
  @ApiProperty({
    example: 'you@gmail.com',
    description: 'Inbox that should receive the EmailJS test message',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}
