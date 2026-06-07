import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Stateless logout — instructs the client to discard its access token.
   * Actual token invalidation is handled by Supabase on the client side
   * (supabase.auth.signOut()). This endpoint exists so the frontend has a
   * consistent server-acknowledged logout hook.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Acknowledge logout',
    description:
      'Returns a CLEAR_TOKENS instruction. The client must call ' +
      'supabase.auth.signOut() to revoke the Supabase session.',
  })
  @ApiResponse({ status: 200, description: 'Logout acknowledged' })
  logout() {
    return this.authService.logout();
  }
}
