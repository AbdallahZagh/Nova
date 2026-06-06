import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProjectRole } from '../../common/decorators/require-project-role.decorator';

export class UpdateProjectMemberDto {
  @ApiProperty({
    example: ProjectRole.ADMIN,
    enum: ProjectRole,
    description: 'New project role for the member',
  })
  @IsEnum(ProjectRole)
  role: ProjectRole;
}
