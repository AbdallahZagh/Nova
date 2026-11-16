import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List your subscriptions',
    description:
      'Returns the signed-in user subscriptions with monthly, 30-day and yearly totals. Charge dates are shown exactly as saved.',
  })
  @ApiResponse({ status: 200, description: 'Subscription list and totals' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  list(@CurrentUser('id') userId: string) {
    return this.subscriptions.list(userId);
  }

  @Post('renew-all')
  @ApiOperation({
    summary: 'Mark every overdue subscription as renewed',
    description:
      'Moves each passed charge date to the next date in its cycle. Paused and canceled subscriptions are left alone. Only runs when you ask for it.',
  })
  @ApiResponse({
    status: 201,
    description: 'How many were renewed, plus the refreshed list and totals',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Demo accounts cannot manage subscriptions',
  })
  renewAll(@CurrentUser('id') userId: string) {
    return this.subscriptions.renewAllOverdue(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one subscription' })
  @ApiParam({ name: 'id', description: 'Subscription id' })
  @ApiResponse({ status: 200, description: 'Subscription' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.subscriptions.get(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a subscription' })
  @ApiResponse({ status: 201, description: 'Subscription created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Demo accounts cannot manage subscriptions',
  })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptions.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a subscription' })
  @ApiParam({ name: 'id', description: 'Subscription id' })
  @ApiResponse({ status: 200, description: 'Subscription updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Demo accounts cannot manage subscriptions',
  })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptions.update(userId, id, dto);
  }

  @Post(':id/renew')
  @ApiOperation({
    summary: 'Mark a subscription as renewed',
    description:
      'Moves a passed charge date to the next date in its cycle. A trial that has ended becomes active. Only runs when you ask for it.',
  })
  @ApiParam({ name: 'id', description: 'Subscription id' })
  @ApiResponse({ status: 201, description: 'Subscription with its new charge date' })
  @ApiResponse({ status: 400, description: 'Paused or canceled subscriptions cannot renew' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Demo accounts cannot manage subscriptions',
  })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  renew(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.subscriptions.renew(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a subscription' })
  @ApiParam({ name: 'id', description: 'Subscription id' })
  @ApiResponse({ status: 200, description: 'Subscription removed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  @ApiResponse({
    status: 403,
    description: 'Demo accounts cannot manage subscriptions',
  })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.subscriptions.remove(userId, id);
  }
}
