import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DeviceTokensController } from './device-tokens.controller';
import { NotificationsScheduler } from './notifications.scheduler';
import { NotificationsService } from './notifications.service';
import { WindowsPushService } from './windows-push.service';

@Module({
  imports: [PrismaModule, SubscriptionsModule],
  controllers: [DeviceTokensController],
  providers: [NotificationsService, NotificationsScheduler, WindowsPushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
