import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { RolesGuard } from '../common/roles.guard';
import { AdminController } from './admin.controller';
import { AdminAuditService, AdminService } from './admin.service';

@Module({
  imports: [MailModule, NotificationsModule, StorageModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuditService, RolesGuard],
  exports: [AdminService, AdminAuditService],
})
export class AdminModule {}
