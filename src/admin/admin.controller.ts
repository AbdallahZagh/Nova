import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles, UserRole } from '../common/roles';
import { RolesGuard } from '../common/roles.guard';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import {
  AdminBroadcastScope,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../generated/prisma/enums.js';
import { AdminService } from './admin.service';

class SettingsDto {
  @IsOptional() @IsBoolean() maintenanceMode?: boolean;
  @IsOptional() @IsString() broadcastBanner?: string | null;
  @IsOptional() @IsBoolean() aiEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) defaultAiDailyQuota?: number;
  @IsOptional() @IsBoolean() registrationsEnabled?: boolean;
  @IsOptional() @IsBoolean() fcmEnabled?: boolean;
  @IsOptional() @IsBoolean() whiteboardRealtimeEnabled?: boolean;
}

class BroadcastDto {
  @IsEnum(AdminBroadcastScope) scope!: AdminBroadcastScope;
  @IsOptional() @IsUUID() targetUserId?: string;
  @IsOptional() @IsUUID() targetProjectId?: string;
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() actionUrl?: string;
  @IsOptional() @IsBoolean() inApp?: boolean;
  @IsOptional() @IsBoolean() fcm?: boolean;
  @IsOptional() @IsBoolean() email?: boolean;
}

class TicketReplyDto {
  @IsString() body!: string;
  @IsOptional() @IsBoolean() resolve?: boolean;
}

class TicketPatchDto {
  @IsOptional() @IsEnum(SupportTicketStatus) status?: SupportTicketStatus;
  @IsOptional() @IsEnum(SupportTicketPriority) priority?: SupportTicketPriority;
}

class QuotaDto {
  @IsInt() @Min(0) dailyLimit!: number;
}

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('api/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Patch('settings')
  patchSettings(@CurrentUser() user: AuthUser, @Body() dto: SettingsDto) {
    return this.admin.patchSettings(user, dto);
  }

  @Get('users')
  listUsers(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.listUsers(q, Number(page) || 1, Number(limit) || 20);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:id/suspend')
  suspend(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.suspend(user, id);
  }

  @Post('users/:id/reinstate')
  reinstate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.reinstate(user, id);
  }

  @Post('users/:id/verify-otp')
  verifyOtp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.verifyOtp(user, id);
  }

  @Post('users/:id/reset-demo')
  resetDemo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.resetDemo(user, id);
  }

  @Post('users/:id/promote')
  promote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.promote(user, id);
  }

  @Post('users/:id/demote')
  demote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.demote(user, id);
  }

  @Post('users/:id/revoke-tokens')
  revokeTokens(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.revokeTokens(user, id);
  }

  @Get('demo/overview')
  demoOverview() {
    return this.admin.demoOverview();
  }

  @Get('demo/sessions')
  demoSessions(@Query('page') page?: string) {
    return this.admin.demoSessions(Number(page) || 1);
  }

  @Get('support/tickets')
  listTickets(
    @Query('status') status?: SupportTicketStatus,
    @Query('priority') priority?: SupportTicketPriority,
    @Query('category') category?: SupportTicketCategory,
    @Query('page') page?: string,
  ) {
    return this.admin.listTickets({
      status,
      priority,
      category,
      page: Number(page) || 1,
    });
  }

  @Get('support/tickets/:id')
  getTicket(@Param('id') id: string) {
    return this.admin.getTicket(id);
  }

  @Patch('support/tickets/:id')
  patchTicket(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TicketPatchDto,
  ) {
    return this.admin.patchTicket(user, id, dto);
  }

  @Post('support/tickets/:id/replies')
  replyTicket(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TicketReplyDto,
  ) {
    return this.admin.replyTicket(user, id, dto.body, dto.resolve);
  }

  @Get('notifications/broadcasts')
  listBroadcasts() {
    return this.admin.listBroadcasts();
  }

  @Post('notifications/broadcasts')
  sendBroadcast(@CurrentUser() user: AuthUser, @Body() dto: BroadcastDto) {
    return this.admin.sendBroadcast(user, dto);
  }

  @Get('ai/usage')
  aiUsage() {
    return this.admin.aiUsage();
  }

  @Patch('ai/quotas/:userId')
  setQuota(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: QuotaDto,
  ) {
    return this.admin.setAiQuota(user, userId, dto.dailyLimit);
  }

  @Get('audit')
  listAudit(@Query('action') action?: string, @Query('page') page?: string) {
    return this.admin.listAudit({ action, page: Number(page) || 1 });
  }
}
