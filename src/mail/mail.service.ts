import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

type OtpPurpose = 'REGISTER' | 'FORGOT_PASSWORD' | 'REACTIVATE';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor() {
    this.transporter = this.createTransporter();
  }

  async sendOtpEmail(to: string, code: string, purpose: OtpPurpose) {
    if (!this.transporter) {
      this.handleMissingConfig();
      return;
    }

    const subject = this.subjectForPurpose(purpose);
    const html = this.renderOtpHtml(code, purpose);
    const text = this.renderOtpText(code, purpose);

    try {
      await this.transporter.sendMail({
        from: this.fromAddress(),
        to,
        subject,
        text,
        html,
      });
    } catch (error) {
      this.logger.error('Failed to send OTP email', error);
      throw new InternalServerErrorException(
        'Unable to send verification email. Please try again later.',
      );
    }
  }

  async sendProjectInviteEmail(to: string, projectName: string, role: string) {
    if (!this.transporter) {
      this.handleMissingConfig();
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress(),
        to,
        subject: `You have been added to ${projectName}`,
        text: this.renderProjectInviteText(projectName, role),
        html: this.renderProjectInviteHtml(projectName, role),
      });
    } catch (error) {
      this.logger.error('Failed to send project invite email', error);
      throw new InternalServerErrorException(
        'Project member was added, but the invitation email could not be sent.',
      );
    }
  }

  async sendTestEmail(to: string) {
    if (!this.transporter) {
      this.handleMissingConfig();
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress(),
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
    } catch (error) {
      this.logger.error('Failed to send test email', error);
      throw new InternalServerErrorException(
        'Unable to send test email. Please check the backend mail configuration.',
      );
    }
  }

  private createTransporter(): nodemailer.Transporter | null {
    const host = process.env.MAIL_HOST;
    const port = Number(process.env.MAIL_PORT);
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS?.replace(/\s/g, '');

    if (!host || !port || !user || !pass) return null;

    return nodemailer.createTransport({
      host,
      port,
      secure: process.env.MAIL_SECURE === 'true',
      auth: { user, pass },
    });
  }

  private handleMissingConfig() {
    const message =
      'Mail service is not configured. Set MAIL_HOST, MAIL_PORT, MAIL_USER, and MAIL_PASS.';

    if (process.env.NODE_ENV === 'production') {
      throw new InternalServerErrorException(message);
    }

    this.logger.warn(message);
  }

  private fromAddress(): string {
    const name = process.env.MAIL_FROM_NAME ?? 'Nova';
    const email = process.env.MAIL_FROM_EMAIL ?? process.env.MAIL_USER;
    return email ? `"${name}" <${email}>` : name;
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
