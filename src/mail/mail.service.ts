import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Resend } from 'resend';

type OtpPurpose = 'REGISTER' | 'FORGOT_PASSWORD' | 'REACTIVATE';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;

    const name = process.env.MAIL_FROM_NAME ?? 'Nova';
    const email = process.env.MAIL_FROM_EMAIL ?? 'onboarding@resend.dev';
    this.from = `${name} <${email}>`;
  }

  async sendOtpEmail(to: string, code: string, purpose: OtpPurpose) {
    if (!this.resend) {
      this.handleMissingConfig();
      return;
    }

    const subject = this.subjectForPurpose(purpose);

    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      text: this.renderOtpText(code, purpose),
      html: this.renderOtpHtml(code, purpose),
    });

    if (error) {
      // Log but do NOT throw — the OTP is already saved in the database and
      // returned in the API response, so the user can still complete the flow
      // even if the email could not be delivered.
      this.logger.warn('OTP email could not be delivered (non-fatal)');
      this.logger.warn(error);
    }
  }

  async sendProjectInviteEmail(to: string, projectName: string, role: string) {
    if (!this.resend) {
      this.handleMissingConfig();
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: `You have been added to ${projectName}`,
      text: this.renderProjectInviteText(projectName, role),
      html: this.renderProjectInviteHtml(projectName, role),
    });

    if (error) {
      // Non-fatal: member was added successfully; email is a courtesy notification
      this.logger.warn('Project invite email could not be delivered (non-fatal)');
      this.logger.warn(error);
    }
  }

  async sendTestEmail(to: string) {
    if (!this.resend) {
      this.handleMissingConfig();
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: 'Nova email test',
      text: 'Your Nova backend email configuration is working.',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h2 style="margin: 0 0 12px;">Nova email test</h2>
          <p>Your Nova backend email configuration is working.</p>
        </div>
      `,
    });

    if (error) {
      this.logger.error('Failed to send test email');
      this.logger.error(error);
      throw new InternalServerErrorException(
        'Unable to send test email. Please check the backend mail configuration.',
      );
    }
  }

  private handleMissingConfig() {
    const message =
      'Mail service is not configured. Set RESEND_API_KEY in your environment variables.';

    if (process.env.NODE_ENV === 'production') {
      throw new InternalServerErrorException(message);
    }

    this.logger.warn(message);
  }

  private subjectForPurpose(purpose: OtpPurpose): string {
    switch (purpose) {
      case 'REGISTER':
        return 'Verify your Nova account';
      case 'FORGOT_PASSWORD':
        return 'Reset your Nova password';
      case 'REACTIVATE':
        return 'Reactivate your Nova account';
    }
  }

  private introForPurpose(purpose: OtpPurpose): string {
    switch (purpose) {
      case 'REGISTER':
        return 'Use this code to verify your Nova account.';
      case 'FORGOT_PASSWORD':
        return 'Use this code to reset your Nova password.';
      case 'REACTIVATE':
        return 'Use this code to reactivate your Nova account.';
    }
  }

  private renderOtpText(code: string, purpose: OtpPurpose): string {
    return `${this.introForPurpose(purpose)}\n\nCode: ${code}\n\nThis code expires in 15 minutes.`;
  }

  private renderOtpHtml(code: string, purpose: OtpPurpose): string {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin: 0 0 12px;">Nova verification code</h2>
        <p>${this.introForPurpose(purpose)}</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 20px 0;">${code}</p>
        <p>This code expires in 15 minutes.</p>
        <p style="color: #6b7280; font-size: 13px;">If you did not request this code, you can ignore this email.</p>
      </div>
    `;
  }

  private renderProjectInviteText(projectName: string, role: string): string {
    return `You have been added to the Nova project "${projectName}" with the role ${role}.\n\nLog in to Nova to view the project.`;
  }

  private renderProjectInviteHtml(projectName: string, role: string): string {
    const safeProjectName = this.escapeHtml(projectName);
    const safeRole = this.escapeHtml(role);

    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin: 0 0 12px;">You have been added to a Nova project</h2>
        <p>You have been added to <strong>${safeProjectName}</strong>.</p>
        <p>Your project role is <strong>${safeRole}</strong>.</p>
        <p>Log in to Nova to view the project and start collaborating.</p>
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
