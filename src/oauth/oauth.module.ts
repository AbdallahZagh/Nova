import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OAuthConsentController } from './oauth-consent.controller';
import { NovaOAuthProvider } from './oauth.provider';

@Module({
  imports: [AuthModule],
  controllers: [OAuthConsentController],
  providers: [NovaOAuthProvider],
  exports: [NovaOAuthProvider],
})
export class OAuthModule {}
