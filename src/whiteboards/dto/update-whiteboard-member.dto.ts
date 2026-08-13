import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WhiteboardRole } from '../whiteboard-role';

export class UpdateWhiteboardMemberDto {
  @ApiProperty({ enum: WhiteboardRole, example: WhiteboardRole.MEMBER })
  @IsEnum(WhiteboardRole)
  role: WhiteboardRole;
}
