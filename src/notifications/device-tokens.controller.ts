import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DenyDemo } from '../demo/deny-demo.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { SaveDeviceTokenDto } from './dto/save-device-token.dto';
import { NotificationsService } from './notifications.service';
import { WindowsChannelDto } from './dto/windows-channel.dto';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller(['device-tokens', 'api/device-tokens'])
export class DeviceTokensController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('save')
  @HttpCode(HttpStatus.OK)
  @DenyDemo()
  @ApiOperation({ summary: 'Save or refresh an FCM device token' })
  @ApiResponse({ status: 200, description: 'Device token saved' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  saveDeviceToken(
    @CurrentUser('id') userId: string,
    @Body() dto: SaveDeviceTokenDto,
  ) {
    return this.notificationsService.saveDeviceToken(userId, dto);
  }

  @Get('windows')
  windowsConfiguration() {
    return this.notificationsService.windowsConfiguration();
  }

  @Post('windows')
  @HttpCode(HttpStatus.OK)
  @DenyDemo()
  registerWindowsChannel(
    @CurrentUser('id') userId: string,
    @Body() dto: WindowsChannelDto,
  ) {
    return this.notificationsService.registerWindowsChannel(
      userId,
      dto.channel,
      dto.previousChannel,
    );
  }

  @Delete('windows')
  @DenyDemo()
  removeWindowsChannel(
    @CurrentUser('id') userId: string,
    @Body() dto: WindowsChannelDto,
  ) {
    return this.notificationsService.removeWindowsChannel(userId, dto.channel);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'List notifications for the current user' })
  @ApiResponse({ status: 200, description: 'Notifications returned' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  listNotifications(
    @CurrentUser('id') userId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listNotifications(
      userId,
      query.page,
      query.limit,
    );
  }

  @Patch('notifications/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark notifications as read',
    description:
      'Pass notificationId to mark one notification as read. Omit notificationId to mark all current user notifications as read.',
  })
  @ApiResponse({ status: 200, description: 'Notification read state updated' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  markNotificationsRead(
    @CurrentUser('id') userId: string,
    @Body() dto: MarkNotificationsReadDto,
  ) {
    return this.notificationsService.markNotificationsRead(
      userId,
      dto.notificationId,
    );
  }

  @Post('test-notification')
  @HttpCode(HttpStatus.OK)
  @DenyDemo()
  @ApiOperation({
    summary: 'Create a test notification for the current user',
    description:
      'Useful for testing Supabase Realtime notification inserts and Firebase Cloud Messaging delivery.',
  })
  @ApiResponse({ status: 200, description: 'Test notification created' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  async testNotification(@CurrentUser('id') userId: string) {
    const notification = await this.notificationsService.createNotification(
      userId,
      'TEST_NOTIFICATION',
      'Test notification',
      'Your notification setup is working.',
      { source: 'manual-test', createdBy: userId },
    );

    return {
      message: 'Test notification created successfully',
      data: notification,
    };
  }
}
