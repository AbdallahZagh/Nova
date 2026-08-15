import { Injectable, InternalServerErrorException } from '@nestjs/common';

type OtpPurpose = 'REGISTER' | 'FORGOT_PASSWORD' | 'REACTIVATE';

interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
}

@Injectable()
export class EmailService {
  private readonly config: EmailJsConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  async sendOtp(email: string, code: string): Promise<void> {
    await this.sendUniversalEmail(
      email,
      `${code} is your verification code`,
      this.wrapLayout(`
        <p style="margin: 0 0 16px; color: #3f3f46;">Use this code to verify your identity. It expires in 10 minutes.</p>
        <div style="font-family: monospace; font-size: 32px; letter-spacing: 4px; background-color: #f4f4f5; padding: 16px; border-radius: 6px; text-align: center; color: #18181b; margin: 20px 0;">
          ${this.escapeHtml(code)}
        </div>
        <p style="margin: 16px 0 0; color: #71717a; font-size: 13px;">If you did not request this code, you can ignore this email.</p>
      `),
    );
  }

  async sendProjectAddedNotification(
    email: string,
    projectName: string,
    inviterName: string,
    projectLink: string,
  ): Promise<void> {
    const safeProjectName = this.escapeHtml(projectName);
    const safeInviterName = this.escapeHtml(inviterName);
    const safeProjectLink = this.escapeHtml(projectLink);

    await this.sendUniversalEmail(
      email,
      `You've been added to the project: ${projectName}`,
      this.wrapLayout(`
        <p style="margin: 0 0 16px; color: #3f3f46;">
          ${safeInviterName} has directly added you to the project <strong>${safeProjectName}</strong>.
        </p>
        <p style="margin: 0 0 24px; color: #3f3f46;">You can open the project from the button below.</p>
        <a href="${safeProjectLink}" style="display: inline-block; background-color: #18181b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Go to Project
        </a>
        <p style="margin: 24px 0 0; color: #71717a; font-size: 13px;">
          If the button does not work, copy and paste this link:<br>
          <a href="${safeProjectLink}" style="color: #2563eb;">${safeProjectLink}</a>
        </p>
      `),
    );
  }

  async sendOtpEmail(email: string, code: string, _purpose: OtpPurpose): Promise<void> {
    await this.sendOtp(email, code);
  }

  async sendTestEmail(email: string): Promise<void> {
    await this.sendUniversalEmail(
      email,
      'Nova email test',
      this.wrapLayout(`
        <p style="margin: 0; color: #3f3f46;">Your Nova backend EmailJS configuration is working.</p>
      `),
    );
  }

  private async sendUniversalEmail(
    toEmail: string,
    subject: string,
    htmlBody: string,
  ): Promise<void> {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: this.config.serviceId,
        template_id: this.config.templateId,
        user_id: this.config.publicKey,
        accessToken: this.config.privateKey,
        template_params: {
          email: toEmail,
          to_email: toEmail,
          email_subject: subject,
          email_body: htmlBody,
        },
      }),
    });

    if (!response.ok) {
      const providerMessage = await response.text();
      throw new InternalServerErrorException({
        message: 'EmailJS delivery failed',
        providerMessage,
        statusCode: response.status,
      });
    }
  }

  private loadConfig(): EmailJsConfig {
    const required = {
      serviceId: process.env.EMAILJS_SERVICE_ID,
      templateId: process.env.EMAILJS_TEMPLATE_ID,
      publicKey: process.env.EMAILJS_PUBLIC_KEY,
      privateKey: process.env.EMAILJS_PRIVATE_KEY,
    };

    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length) {
      throw new InternalServerErrorException(
        `EmailJS configuration is missing: ${missing.join(', ')}`,
      );
    }

    return required as EmailJsConfig;
  }

  private wrapLayout(content: string): string {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 16px; color: #18181b;">Nova</h2>
        ${content}
      </div>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
