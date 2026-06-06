import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubtaskAssignmentInputDto {
  @ApiProperty({ example: 'f2884fdb-6279-42e7-b2cf-f5f7ff7ade17' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    type: [String],
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  subtaskIds: string[];
}

export class AssignSubtasksDto {
  @ApiPropertyOptional({ example: 'f2884fdb-6279-42e7-b2cf-f5f7ff7ade17' })
  @ValidateIf((dto) => !dto.assignments?.length)
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  })
  @ValidateIf((dto) => !dto.assignments?.length)
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  subtaskIds?: string[];

  @ApiPropertyOptional({ type: [SubtaskAssignmentInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SubtaskAssignmentInputDto)
  assignments?: SubtaskAssignmentInputDto[];
}
