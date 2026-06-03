import { Body, Controller, Delete, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the full profile of the authenticated user — name, role, bio, avatar URL, and account metadata.',
  })
  @ApiResponse({ status: 200, description: 'User profile returned successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Partially updates one or more profile metadata fields. Only provided fields are written; omitted fields are left unchanged.',
  })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed — check field formats' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Delete('me')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Deactivate (archive) the current account',
    description:
      'Marks the account as archived and inactive. The user is immediately signed out. ' +
      'All data (projects, tasks, history) is preserved. ' +
      'To restore the account: call POST /api/auth/reactivate with your email, then verify the OTP via POST /api/auth/verify-otp with purpose "REACTIVATE".',
  })
  @ApiResponse({
    status: 200,
    description: 'Account deactivated — client should clear stored tokens',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  deactivateAccount(@CurrentUser('id') userId: string) {
    return this.authService.deactivateAccount(userId);
  }
}
