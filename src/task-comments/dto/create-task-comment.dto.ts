import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateTaskCommentDto {
  @ApiProperty({
    example: 'I am blocked because the API payload is missing the due date.',
    description: 'Comment content to add to the task',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the task this comment belongs to',
  })
  @IsUUID()
  @IsNotEmpty()
  taskId: string;
}
