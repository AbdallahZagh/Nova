import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateSubtaskDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the parent task this checklist item belongs to',
  })
  @IsUUID()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({
    example: 'Configure CORS middleware',
    description: 'Short checklist item title displayed in the task side-drawer',
  })
  @IsString()
  @IsNotEmpty()
  title: string;
}
