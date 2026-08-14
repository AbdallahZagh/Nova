import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WhiteboardRole } from '../whiteboard-role';

export class CreateWhiteboardInviteDto {
  @ApiProperty({ enum: WhiteboardRole })
  @IsEnum(WhiteboardRole)
  role: WhiteboardRole;
}
