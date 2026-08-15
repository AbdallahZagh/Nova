import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'sarah.johnson@devteam.io',
    description: 'Registered email address or username (with or without @)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Email or username is required' })
  email: string;

  @ApiProperty({
    example: 'SecureP@ss123',
    description: 'Account password',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
