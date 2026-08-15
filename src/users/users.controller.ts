import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DenyDemo } from '../demo/deny-demo.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EmailService } from '../mail/email.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserSearchDto } from './dto/user-search.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search users by name or email for team invitations',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search term' })
  @ApiResponse({
    status: 200,
    description: 'Safe user search results',
    schema: {
      example: [
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          fullName: 'Sarah Johnson',
          email: 'sarah.johnson@devteam.io',
          avatarUrl: null,
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  search(@Query() dto: UserSearchDto, @CurrentUser('id') userId: string) {
    return this.usersService.searchUsers(dto.q, userId);
  }

  @Post('me/test-email')
  @HttpCode(200)
  @DenyDemo('The demo account cannot send email.')
  @ApiOperation({
    summary: 'Send a test email to the current user',
    description:
      "Requires a Bearer token. Sends the EmailJS test message to the authenticated user's email. Demo accounts are blocked.",
  })
  @ApiResponse({ status: 200, description: 'Test email sent' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 403, description: 'Demo account cannot send email' })
  async sendTestEmail(@CurrentUser('id') userId: string) {
    const email = await this.usersService.getEmail(userId);
    await this.emailService.sendTestEmail(email);
    return { message: 'Test email sent successfully' };
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the full profile of the authenticated user — name, role, bio, avatar URL, and account metadata.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile returned successfully',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Get(':id/profile')
  @ApiOperation({
    summary: 'Get a user profile',
    description:
      'Returns profile metadata, overall project/task counts, profile activity, and project task stats for the selected user.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User profile returned successfully',
    schema: {
      example: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        email: 'sarah.johnson@devteam.io',
        username: 'sarah',
        fullName: 'Sarah Johnson',
        isActive: true,
        isArchived: false,
        roleTitle: 'Product Designer',
        bio: 'Designing calm project workflows.',
        avatarUrl: null,
        projectsCount: 3,
        tasksCount: 12,
        activity: {
          '2026-06-08': [
            {
              id: 'task-id',
              title: 'Finalize project profile API',
              status: 'In Progress',
              dueDate: '2026-06-10',
              projectName: 'Nova',
              completionPercentage: 50,
            },
          ],
        },
        projects: [
          {
            id: 'project-id',
            name: 'Nova',
            description: 'Team task management',
            status: 'Active',
            createdAt: '2026-06-01T12:00:00.000Z',
            updatedAt: '2026-06-08T12:00:00.000Z',
            role: 'ADMIN',
            totalTasksCount: 20,
            userTasksCount: 5,
            completedUserTasksCount: 2,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUserProfile(@Param('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Post('me/avatar')
  @DenyDemo('The demo profile photo cannot be changed.')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload the current user avatar to Supabase Storage' })
  @ApiResponse({ status: 200, description: 'Avatar updated successfully' })
  @ApiResponse({ status: 400, description: 'Missing or invalid image file' })
  uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose an image to upload.');
    }
    const allowed = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException('Use a JPG, PNG, WEBP, or GIF image.');
    }
    return this.usersService.uploadAvatar(userId, file);
  }

  @Delete('me/avatar')
  @DenyDemo('The demo profile photo cannot be changed.')
  @ApiOperation({ summary: 'Remove the current user avatar from Supabase Storage' })
  @ApiResponse({ status: 200, description: 'Avatar removed successfully' })
  deleteAvatar(@CurrentUser('id') userId: string) {
    return this.usersService.deleteAvatar(userId);
  }

  @Patch('me')
  @DenyDemo('The demo profile cannot be edited.')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Partially updates one or more profile metadata fields. Only provided fields are written; omitted fields are left unchanged.',
  })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed — check field formats',
  })
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
  @DenyDemo('The demo account cannot be deactivated.')
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
