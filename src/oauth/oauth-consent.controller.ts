import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NovaOAuthProvider } from './oauth.provider';

@ApiTags('OAuth')
@Controller('api/oauth/requests')
export class OAuthConsentController {
  constructor(private readonly oauth: NovaOAuthProvider) {}

  @Get(':id')
  describe(@Param('id', ParseUUIDPipe) id: string) {
    return this.oauth.describeRequest(id);
  }

  @Post(':id/approve')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.oauth.approveRequest(id, user);
  }

  @Post(':id/deny')
  deny(@Param('id', ParseUUIDPipe) id: string) {
    return this.oauth.denyRequest(id);
  }
}
