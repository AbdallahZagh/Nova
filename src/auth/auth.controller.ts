import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates a new inactive user record, hashes the password, and issues a 6-digit OTP to the provided email. ' +
      'The account remains locked until the OTP is verified via POST /api/auth/verify-otp.',
  })
  @ApiResponse({
    status: 201,
    description: 'Account created — OTP issued to the registered email address',
  })
  @ApiResponse({ status: 400, description: 'Validation failed — check request body fields' })
  @ApiResponse({ status: 409, description: 'An account with this email already exists' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── Verify OTP ───────────────────────────────────────────────────────────

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a one-time password (OTP)',
    description:
      'Validates the 6-digit OTP against the issued code and its expiry. ' +
      'For REGISTER purpose: activates the account. ' +
      'For FORGOT_PASSWORD purpose: confirms identity and allows the reset-password step.',
  })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP code' })
  @ApiResponse({ status: 404, description: 'No account found with the provided email' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate a user and obtain an access token',
    description:
      'Validates email and password against stored credentials. ' +
      'Rejects unverified accounts. On success returns a mock JWT access token ' +
      'and the sanitised user profile (no password hash).',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful — returns accessToken and user profile',
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or account not yet verified' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate the forgot-password flow',
    description:
      'Looks up the account by email, invalidates any existing reset OTPs, ' +
      'generates a fresh 6-digit code, and stores it with a 15-minute expiry. ' +
      'The code must then be verified via POST /api/auth/verify-otp before resetting.',
  })
  @ApiResponse({ status: 200, description: 'Reset code issued — check email' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'No account found with this email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // ─── Reset Password ───────────────────────────────────────────────────────

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset account password using a verified OTP',
    description:
      'Re-validates the FORGOT_PASSWORD OTP, hashes the new password with bcrypt, ' +
      'writes it to the user record, and permanently deletes the consumed OTP ' +
      'to prevent replay attacks.',
  })
  @ApiResponse({ status: 200, description: 'Password updated — user may now log in' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or already-used reset code' })
  @ApiResponse({ status: 404, description: 'No account found with this email' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out the current session',
    description:
      'Returns a CLEAR_TOKENS instruction payload. ' +
      'The client is responsible for discarding the access token from storage. ' +
      'Once a real JWT strategy is added, this endpoint will also blacklist the token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout acknowledged — client should clear stored tokens',
  })
  logout() {
    return this.authService.logout();
  }
}
