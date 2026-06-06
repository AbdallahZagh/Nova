import { SetMetadata } from '@nestjs/common';

export enum ProjectRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export const REQUIRED_PROJECT_ROLES_KEY = 'requiredProjectRoles';

export const RequireProjectRole = (...roles: ProjectRole[]) =>
  SetMetadata(REQUIRED_PROJECT_ROLES_KEY, roles);
