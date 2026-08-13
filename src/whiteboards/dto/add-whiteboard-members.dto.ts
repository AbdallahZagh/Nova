import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { WhiteboardRole } from '../whiteboard-role';

export class WhiteboardMemberInputDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: WhiteboardRole, example: WhiteboardRole.MEMBER })
  @IsEnum(WhiteboardRole)
  role: WhiteboardRole;
}

export class AddWhiteboardMembersDto {
  @ApiPropertyOptional()
  @ValidateIf((dto: AddWhiteboardMembersDto) => !dto.members?.length)
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: WhiteboardRole, example: WhiteboardRole.MEMBER })
  @ValidateIf((dto: AddWhiteboardMembersDto) => !dto.members?.length)
  @IsEnum(WhiteboardRole)
  role?: WhiteboardRole;

  @ApiPropertyOptional({ type: [WhiteboardMemberInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WhiteboardMemberInputDto)
  members?: WhiteboardMemberInputDto[];
}
