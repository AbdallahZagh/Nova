import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SystemSettingsService } from './system-settings.service';

@ApiTags('System')
@Controller('api/system')
export class SystemController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Public maintenance and feature flags' })
  getStatus() {
    const row = this.settings.getCached();
    return {
      maintenanceMode: row.maintenanceMode,
      banner: row.broadcastBanner,
      aiEnabled: row.aiEnabled,
      registrationsEnabled: row.registrationsEnabled,
      fcmEnabled: row.fcmEnabled,
    };
  }
}
