import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ReplyTaskCommentDto {
  @ApiProperty({
    example:
      'Use the ISO date from the project timeline picker and submit it as dueDate.',
    description: 'Admin or owner reply explaining what should be done',
  })
  @IsString()
  @IsNotEmpty()
  replyContent: string;
}
