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

type OtpPurpose = 'REGISTER' | 'FORGOT_PASSWORD' | 'REACTIVATE';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const username = normalizeUsername(dto.username);

    const existing = await (this.prisma as any).user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing?.email === email) {
      throw new ConflictException('Email is already registered');
    }

    if (existing?.username === username) {
      throw new ConflictException('Username is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await (this.prisma as any).user.create({
      data: {
        email,
        username,
        passwordHash,
        fullName: dto.fullName,
        roleTitle: dto.roleTitle,
        isActive: false,
        isArchived: false,
      },
    });

    await this.issueOtp(user.id, email, 'REGISTER');

    return {
      message: 'Registration successful. Please verify your email with the OTP code.',
      email,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase();
    const user = await this.findUserByEmail(email);
    await this.consumeOtp(user.id, dto.code, dto.purpose);

    if (dto.purpose === 'REGISTER' || dto.purpose === 'REACTIVATE') {
      await (this.prisma as any).user.update({
        where: { id: user.id },
        data: { isActive: true, isArchived: false },
      });
    }

    if (dto.purpose === 'FORGOT_PASSWORD') {
      return { message: 'OTP verified. You can now reset your password.' };
    }

    const activeUser = await (this.prisma as any).user.findUnique({
      where: { id: user.id },
    });

    return this.authResponse(activeUser, 'Email verified successfully');
  }

  async resendOtp(dto: ResendOtpDto) {
    const email = dto.email.toLowerCase();
    const user = await this.findUserByEmail(email);

    if (dto.purpose === 'REGISTER' && user.isActive && !user.isArchived) {
      throw new BadRequestException('Account is already active');
    }

    if (dto.purpose === 'REACTIVATE' && !user.isArchived) {
      throw new BadRequestException('Account is not archived');
    }

    await this.issueOtp(user.id, email, dto.purpose);
    return { message: 'OTP resent successfully', email };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    const user = await (this.prisma as any).user.findUnique({
      where: { email },
    });

    if (!user) throw new UnauthorizedException('Invalid email or password');

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.isArchived) {
      throw new UnauthorizedException('Account is archived. Please reactivate it first.');
    }

    if (!user.isActive) {
      await this.issueOtp(user.id, email, 'REGISTER');
      throw new UnauthorizedException('Please verify your email before logging in. A new OTP was sent.');
    }

    return this.authResponse(user, 'Login successful');
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.findUserByEmail(email);

    if (user.isArchived) {
      throw new BadRequestException('Account is archived. Reactivate it first.');
    }

    await this.issueOtp(user.id, email, 'FORGOT_PASSWORD');
    return { message: 'Password reset OTP sent successfully', email };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.findUserByEmail(email);

    await this.consumeOtp(user.id, dto.code, 'FORGOT_PASSWORD');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { passwordHash, isActive: true, isArchived: false },
    });

    return { message: 'Password reset successfully' };
  }

  async requestReactivation(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.findUserByEmail(email);

    if (!user.isArchived) {
      throw new BadRequestException('Account is not archived');
    }

    await this.issueOtp(user.id, email, 'REACTIVATE');
    return { message: 'Reactivation OTP sent successfully', email };
  }

  logout() {
    return {
      message: 'Logged out successfully.',
      action: 'CLEAR_TOKENS',
    };
  }

  async deactivateAccount(userId: string) {
    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { isActive: false, isArchived: true },
    });

    return {
      message:
        'Your account has been deactivated. Verify a reactivation OTP to restore it.',
      action: 'CLEAR_TOKENS',
    };
  }

  private async findUserByEmail(email: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async issueOtp(userId: string, email: string, purpose: OtpPurpose) {
    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await (this.prisma as any).otp.deleteMany({
      where: { userId, purpose },
    });

    await (this.prisma as any).otp.create({
      data: { userId, code, purpose, expiresAt },
    });

    await this.mailService.sendOtpEmail(email, code, purpose);
  }

  private async consumeOtp(userId: string, code: string, purpose: OtpPurpose) {
    const otp = await (this.prisma as any).otp.findFirst({
      where: { userId, code, purpose },
      orderBy: { expiresAt: 'desc' },
    });

    if (!otp) throw new BadRequestException('Invalid OTP code');

    if (otp.expiresAt < new Date()) {
      await (this.prisma as any).otp.delete({ where: { id: otp.id } });
      throw new BadRequestException('OTP code has expired');
    }

    await (this.prisma as any).otp.delete({ where: { id: otp.id } });
  }

  private authResponse(user: any, message: string) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });

    const { passwordHash, ...safeUser } = user;

    return {
      message,
      accessToken,
      user: safeUser,
    };
  }

  private generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
