import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { normalizeUsername } from '../common/utils/username.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private signToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }

  private otpExpiry(): Date {
    return new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  }

  private async issueOtp(
    userId: string,
    email: string,
    purpose: ResendOtpDto['purpose'],
  ) {
    await (this.prisma as any).otp.deleteMany({
      where: { userId, purpose },
    });

    const code = this.generateOtpCode();

    await (this.prisma as any).otp.create({
      data: {
        userId,
        code,
        purpose,
        expiresAt: this.otpExpiry(),
      },
    });

    await this.mailService.sendOtpEmail(email, code, purpose);

    return code;
  }

  // ─── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const username = normalizeUsername(dto.username);

    const usernameTaken = await (this.prisma as any).user.findUnique({
      where: { username },
    });
    if (usernameTaken) {
      throw new ConflictException('This username is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await (this.prisma as any).user.create({
      data: {
        email: dto.email,
        username,
        passwordHash,
        fullName: dto.fullName,
        roleTitle: dto.roleTitle,
        isActive: false,
      },
    });

    const code = await this.issueOtp(user.id, user.email, 'REGISTER');

    return {
      message:
        'Registration successful. A 6-digit verification code has been issued — check your email.',
      email: user.email,
      // Expose OTP in non-production so devs can test without an email service
      ...(process.env.NODE_ENV !== 'production' && { _devOtp: code }),
    };
  }

  // ─── Verify OTP ───────────────────────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (!user)
      throw new NotFoundException('No account found with this email address');

    const otp = await (this.prisma as any).otp.findFirst({
      where: { userId: user.id, code: dto.code, purpose: dto.purpose },
    });

    if (!otp) throw new BadRequestException('Invalid OTP code');

    if (otp.expiresAt < new Date()) {
      await (this.prisma as any).otp.delete({ where: { id: otp.id } });
      throw new BadRequestException(
        'OTP has expired — please request a new one',
      );
    }

    if (dto.purpose === 'REGISTER') {
      await (this.prisma as any).user.update({
        where: { id: user.id },
        data: { isActive: true },
      });
      await (this.prisma as any).otp.delete({ where: { id: otp.id } });

      return {
        message: 'Account verified successfully. You may now log in.',
        verified: true,
        accessToken: this.signToken(user.id, user.email),
      };
    }

    if (dto.purpose === 'REACTIVATE') {
      await (this.prisma as any).user.update({
        where: { id: user.id },
        data: { isActive: true, isArchived: false },
      });
      await (this.prisma as any).otp.delete({ where: { id: otp.id } });

      return {
        message: 'Account reactivated successfully. Welcome back!',
        verified: true,
        accessToken: this.signToken(user.id, user.email),
      };
    }

    // FORGOT_PASSWORD — OTP intentionally kept alive for the reset-password step
    return {
      message: 'OTP verified. Proceed to reset your password.',
      verified: true,
    };
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (!user)
      throw new NotFoundException('No account found with this email address');

    if (dto.purpose === 'REGISTER' && user.isActive) {
      throw new BadRequestException('This account is already verified');
    }

    if (dto.purpose === 'REACTIVATE' && !user.isArchived) {
      throw new BadRequestException('This account is not archived');
    }

    const code = await this.issueOtp(user.id, user.email, dto.purpose);

    return {
      message: 'A fresh verification code has been sent to your email address.',
      email: user.email,
      purpose: dto.purpose,
      ...(process.env.NODE_ENV !== 'production' && { _devOtp: code }),
    };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new UnauthorizedException('Invalid email or password');

    if (user.isArchived) {
      throw new UnauthorizedException(
        'This account has been deactivated. Use POST /api/auth/reactivate with your email to restore it.',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is not yet verified. Please check your email for the OTP.',
      );
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch)
      throw new UnauthorizedException('Invalid email or password');

    const { passwordHash, isActive, ...userProfile } = user;

    return {
      accessToken: this.signToken(user.id, user.email),
      user: userProfile,
    };
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (!user)
      throw new NotFoundException('No account found with this email address');

    const code = await this.issueOtp(user.id, user.email, 'FORGOT_PASSWORD');

    return {
      message: 'A password reset code has been sent to your email address.',
      ...(process.env.NODE_ENV !== 'production' && { _devOtp: code }),
    };
  }

  // ─── Reset Password ───────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (!user)
      throw new NotFoundException('No account found with this email address');

    const otp = await (this.prisma as any).otp.findFirst({
      where: { userId: user.id, code: dto.code, purpose: 'FORGOT_PASSWORD' },
    });

    if (!otp)
      throw new BadRequestException('Invalid or already used reset code');

    if (otp.expiresAt < new Date()) {
      await (this.prisma as any).otp.delete({ where: { id: otp.id } });
      throw new BadRequestException(
        'Reset code has expired — please request a new one',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await (this.prisma as any).otp.delete({ where: { id: otp.id } });

    return {
      message:
        'Password reset successfully. You may now log in with your new password.',
    };
  }

  // ─── Deactivate account ───────────────────────────────────────────────────

  async deactivateAccount(userId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { isActive: false, isArchived: true },
    });

    return {
      message:
        'Your account has been deactivated. You can restore it at any time by visiting the login page and choosing "Reactivate account".',
      action: 'CLEAR_TOKENS',
    };
  }

  // ─── Request reactivation ─────────────────────────────────────────────────

  async requestReactivation(email: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email },
    });

    // Generic message — do not reveal whether the account exists
    const genericMessage =
      'If an archived account with that email exists, a reactivation code has been sent.';

    if (!user) return { message: genericMessage };

    if (!user.isArchived) {
      // Account is active or unverified — do not expose state
      return { message: genericMessage };
    }

    const code = await this.issueOtp(user.id, user.email, 'REACTIVATE');

    return {
      message: genericMessage,
      ...(process.env.NODE_ENV !== 'production' && { _devOtp: code }),
    };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  logout() {
    return {
      message: 'Logged out successfully.',
      action: 'CLEAR_TOKENS',
    };
  }
}
