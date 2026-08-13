import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MailController } from './mail.controller';

@Module({
  controllers: [MailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class MailModule {}
