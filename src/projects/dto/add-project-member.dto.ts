import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ProjectRole } from '../../common/decorators/require-project-role.decorator';

export class ProjectMemberInputDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the user to add to the project',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    example: ProjectRole.MEMBER,
    enum: ProjectRole,
    description: 'Role to grant inside the project',
  })
  @IsEnum(ProjectRole)
  role: ProjectRole;
}

export class AddProjectMemberDto {
  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID of the user to add to the project. Used for single-member requests.',
  })
  @ValidateIf((dto: AddProjectMemberDto) => !dto.members?.length)
  @IsUUID()
  @IsNotEmpty()
  userId?: string;

  @ApiPropertyOptional({
    example: ProjectRole.MEMBER,
    enum: ProjectRole,
    description: 'Role to grant inside the project. Used for single-member requests.',
  })
  @ValidateIf((dto: AddProjectMemberDto) => !dto.members?.length)
  @IsEnum(ProjectRole)
  role?: ProjectRole;

  @ApiPropertyOptional({
    description:
      'Optional bulk payload. When provided, the endpoint adds all listed users to the project.',
    type: [ProjectMemberInputDto],
    example: [
      {
        userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        role: ProjectRole.MEMBER,
      },
      {
        userId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        role: ProjectRole.VIEWER,
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberInputDto)
  members?: ProjectMemberInputDto[];
}
