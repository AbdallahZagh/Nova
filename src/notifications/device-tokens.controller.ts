import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SaveDeviceTokenDto } from './dto/save-device-token.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller(['device-tokens', 'api/device-tokens'])
export class DeviceTokensController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save or refresh an FCM device token' })
  @ApiResponse({ status: 200, description: 'Device token saved' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  saveDeviceToken(
    @CurrentUser('id') userId: string,
    @Body() dto: SaveDeviceTokenDto,
  ) {
    return this.notificationsService.saveDeviceToken(userId, dto);
  }
}
