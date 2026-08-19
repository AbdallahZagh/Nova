import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpMetricsService } from './http-metrics.service';
import { LastActiveInterceptor } from './last-active.interceptor';
import { LastActiveService } from './last-active.service';
import { MaintenanceInterceptor } from './maintenance.interceptor';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';
import { SuperAdminSetupController } from './super-admin-setup.controller';
import { SuperAdminSetupGuard } from './super-admin-setup.guard';
import { SuperAdminSetupService } from './super-admin-setup.service';
import { SystemController } from './system.controller';
import { SystemSettingsService } from './system-settings.service';

@Global()
@Module({
  controllers: [SystemController, SuperAdminSetupController],
  providers: [
    SystemSettingsService,
    LastActiveService,
    HttpMetricsService,
    SuperAdminBootstrapService,
    SuperAdminSetupService,
    SuperAdminSetupGuard,
    { provide: APP_INTERCEPTOR, useClass: MaintenanceInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LastActiveInterceptor },
  ],
  exports: [
    SystemSettingsService,
    LastActiveService,
    HttpMetricsService,
  ],
})
export class SystemModule {}
