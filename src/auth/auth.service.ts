import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

  // ─── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await (this.prisma as any).user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        roleTitle: dto.roleTitle,
        isActive: false,
      },
    });

    // Clean up any leftover REGISTER OTPs for this user before creating a fresh one
    await (this.prisma as any).otp.deleteMany({
      where: { userId: user.id, purpose: 'REGISTER' },
    });

    const code = this.generateOtpCode();

    await (this.prisma as any).otp.create({
      data: {
        userId: user.id,
        code,
        purpose: 'REGISTER',
        expiresAt: this.otpExpiry(),
      },
    });

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

    if (!user) throw new NotFoundException('No account found with this email address');

    const otp = await (this.prisma as any).otp.findFirst({
      where: { userId: user.id, code: dto.code, purpose: dto.purpose },
    });

    if (!otp) throw new BadRequestException('Invalid OTP code');

    if (otp.expiresAt < new Date()) {
      await (this.prisma as any).otp.delete({ where: { id: otp.id } });
      throw new BadRequestException('OTP has expired — please request a new one');
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

    // FORGOT_PASSWORD — OTP intentionally kept alive for the reset-password step
    return {
      message: 'OTP verified. Proceed to reset your password.',
      verified: true,
    };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new UnauthorizedException('Invalid email or password');

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is not yet verified. Please check your email for the OTP.',
      );
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid email or password');

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

    if (!user) throw new NotFoundException('No account found with this email address');

    // Invalidate any existing forgot-password OTPs for this user
    await (this.prisma as any).otp.deleteMany({
      where: { userId: user.id, purpose: 'FORGOT_PASSWORD' },
    });

    const code = this.generateOtpCode();

    await (this.prisma as any).otp.create({
      data: {
        userId: user.id,
        code,
        purpose: 'FORGOT_PASSWORD',
        expiresAt: this.otpExpiry(),
      },
    });

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

    if (!user) throw new NotFoundException('No account found with this email address');

    const otp = await (this.prisma as any).otp.findFirst({
      where: { userId: user.id, code: dto.code, purpose: 'FORGOT_PASSWORD' },
    });

    if (!otp) throw new BadRequestException('Invalid or already used reset code');

    if (otp.expiresAt < new Date()) {
      await (this.prisma as any).otp.delete({ where: { id: otp.id } });
      throw new BadRequestException('Reset code has expired — please request a new one');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await (this.prisma as any).otp.delete({ where: { id: otp.id } });

    return {
      message: 'Password reset successfully. You may now log in with your new password.',
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
