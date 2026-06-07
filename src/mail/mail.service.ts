import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

type OtpPurpose = 'REGISTER' | 'FORGOT_PASSWORD' | 'REACTIVATE';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string | null;
  private readonly fromName: string;
  private readonly fromEmail: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY ?? null;
    this.fromName = process.env.MAIL_FROM_NAME ?? 'Nova';
    this.fromEmail = process.env.MAIL_FROM_EMAIL ?? '';
  }

  async sendOtpEmail(to: string, code: string, purpose: OtpPurpose) {
    await this.send({
      to,
      subject: this.subjectForPurpose(purpose),
      html: this.renderOtpHtml(code, purpose),
      text: this.renderOtpText(code, purpose),
      errorLabel: 'OTP',
    });
  }

  async sendProjectInviteEmail(to: string, projectName: string, role: string) {
    await this.send({
      to,
      subject: `You have been added to ${projectName}`,
      html: this.renderProjectInviteHtml(projectName, role),
      text: this.renderProjectInviteText(projectName, role),
      errorLabel: 'project invite',
      fatal: false,
    });
  }

  async sendTestEmail(to: string) {
    await this.send({
      to,
      subject: 'Nova email test',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h2 style="margin: 0 0 12px;">Nova email test</h2>
          <p>Your Nova backend email configuration is working.</p>
        </div>
      `,
      text: 'Your Nova backend email configuration is working.',
      errorLabel: 'test',
    });
  }

  private async send({
    to,
    subject,
    html,
    text,
    errorLabel,
    fatal = true,
  }: {
    to: string;
    subject: string;
    html: string;
    text: string;
    errorLabel: string;
    fatal?: boolean;
  }) {
    if (!this.apiKey || !this.fromEmail) {
      this.handleMissingConfig(fatal);
      return;
    }

    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${this.fromName} <${this.fromEmail}>`,
          to,
          subject,
          html,
          text,
        }),
      });
    } catch (err) {
      this.logger.error(`Failed to reach Resend API (${errorLabel} email)`, err);
      if (fatal) {
        throw new InternalServerErrorException(
          'Unable to send email. Please try again later.',
        );
      }
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      this.logger.error(`Resend rejected ${errorLabel} email (${res.status})`, body);
      if (fatal) {
        throw new InternalServerErrorException(
          'Unable to send email. Please try again later.',
        );
      }
    }
  }

  private handleMissingConfig(fatal: boolean) {
    const message =
      'Mail service is not configured. Set RESEND_API_KEY and MAIL_FROM_EMAIL.';
    if (fatal && process.env.NODE_ENV === 'production') {
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
    const p = this.escapeHtml(projectName);
    const r = this.escapeHtml(role);
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin: 0 0 12px;">You have been added to a Nova project</h2>
        <p>You have been added to <strong>${p}</strong>.</p>
        <p>Your project role is <strong>${r}</strong>.</p>
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
