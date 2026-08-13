import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TestEmailDto } from './dto/test-email.dto';
import { EmailService } from './email.service';

@ApiTags('Mail')
@Controller('api/mail')
export class MailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a test email via EmailJS',
    description:
      'Sends a one-off test message to check that EMAILJS_* env vars and the EmailJS template are working. No auth required.',
  })
  @ApiResponse({ status: 200, description: 'Test email sent' })
  @ApiResponse({ status: 400, description: 'Invalid email address' })
  @ApiResponse({ status: 500, description: 'EmailJS delivery failed' })
  async sendTestEmail(@Body() dto: TestEmailDto) {
    await this.emailService.sendTestEmail(dto.email);
    return { message: `Test email sent to ${dto.email}` };
  }
}
