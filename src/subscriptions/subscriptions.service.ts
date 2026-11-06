import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionIntervalUnit } from '../generated/prisma/enums.js';
import { DemoService } from '../demo/demo.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import {
  formatMoney,
  metadataChargeKey,
  REMINDER_LOOKBACK_MS,
  renewalReminderBody,
  sortSubscriptionResponses,
  startOfDay,
  SubscriptionSnapshot,
  summarizeSubscriptions,
  toDashboardSubscriptions,
  toSubscriptionResponse,
  trialReminderBody,
} from './subscription.logic';

export const DEMO_SUBSCRIPTION_MESSAGE =
  'The demo account cannot manage subscriptions.';

const priceInclude = {
  prices: {
    orderBy: [{ changedAt: 'asc' as const }, { id: 'asc' as const }],
  },
};

type OwnedSubscription = SubscriptionSnapshot & {
  id: string;
  updatedAt: Date;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demo: DemoService,
  ) {}

  async list(userId: string) {
    const now = new Date();
    const rows = await this.prisma.subscription.findMany({
      where: { userId },
      include: priceInclude,
    });
    return {
      items: sortSubscriptionResponses(
        rows.map((row) => toSubscriptionResponse(row, now)),
      ),
      totals: summarizeSubscriptions(rows, now),
    };
  }

  async get(userId: string, id: string) {
    const now = new Date();
    const row = await this.findOwned(userId, id);
    return toSubscriptionResponse(row, now);
  }

  dashboard(userId: string) {
    return this.getDashboard(userId);
  }

  async getDashboard(userId: string) {
    const now = new Date();
    const rows = await this.prisma.subscription.findMany({
      where: { userId },
    });
    return toDashboardSubscriptions(rows, now);
  }

  async create(userId: string, dto: CreateSubscriptionDto) {
    await this.demo.assertNotDemo(userId, DEMO_SUBSCRIPTION_MESSAGE);
    assertChargeDate(dto.nextChargeAt);
    const now = new Date();
    const amount = formatMoney(dto.amount);
    const currency = dto.currency.trim().toUpperCase();
    const created = await this.prisma.subscription.create({
      data: {
        userId,
        service: dto.service.trim(),
        plan: blankToNull(dto.plan),
        amount,
        currency,
        intervalUnit: dto.intervalUnit,
        intervalCount: dto.intervalCount ?? 1,
        nextChargeAt: new Date(dto.nextChargeAt),
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : null,
        status: dto.status ?? 'ACTIVE',
        reason: blankToNull(dto.reason),
        cancelUrl: blankToNull(dto.cancelUrl),
        reminderDays: dto.reminderDays ?? 3,
        paymentLabel: blankToNull(dto.paymentLabel),
        prices: { create: { amount, currency } },
      },
      include: priceInclude,
    });
    return toSubscriptionResponse(created, now);
  }

  async update(userId: string, id: string, dto: UpdateSubscriptionDto) {
    await this.demo.assertNotDemo(userId, DEMO_SUBSCRIPTION_MESSAGE);
    if (dto.nextChargeAt !== undefined) assertChargeDate(dto.nextChargeAt);
    const existing = await this.findOwned(userId, id);
    const data = this.patchData(existing, dto);
    if (Object.keys(data).length === 0) {
      return toSubscriptionResponse(existing, new Date());
    }
    const updated = await this.prisma.subscription.update({
      where: { id: existing.id },
      data,
      include: priceInclude,
    });
    return toSubscriptionResponse(updated, new Date());
  }

  async remindDue(now = new Date()) {
    const rows = await this.prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
    });
    const current = rows;
    const since = new Date(now.getTime() - REMINDER_LOOKBACK_MS);
    const notes = await this.prisma.notification.findMany({
      where: { type: 'SUBSCRIPTION_CHARGE_SOON', createdAt: { gte: since } },
      select: { metadata: true },
    });
    const sent = new Set(
      notes
        .map((note) => metadataChargeKey(note.metadata))
        .filter((key): key is string => Boolean(key)),
    );
    const pending: {
      userId: string;
      title: string;
      body: string;
      metadata: { subscriptionId: string; chargeDate: string; url: string };
    }[] = [];

    for (const row of current) {
      const view = toSubscriptionResponse(row, now);
      if (!view.inWarningWindow) continue;
      const chargeDate = (
        view.status === 'TRIAL' && view.trialEndsAt
          ? new Date(view.trialEndsAt)
          : new Date(view.nextChargeAt)
      ).toISOString();
      const key = metadataChargeKey({
        subscriptionId: view.id,
        chargeDate,
      });
      if (key && sent.has(key)) continue;
      if (key) sent.add(key);
      const body =
        view.status === 'TRIAL'
          ? trialReminderBody(
              view.service,
              view.daysUntilCharge,
              view.amount,
              view.currency,
            )
          : renewalReminderBody(
              view.service,
              view.daysUntilCharge,
              view.amount,
              view.currency,
            );
      pending.push({
        userId: row.userId,
        title: view.status === 'TRIAL' ? 'Trial ends soon' : 'Renews soon',
        body,
        metadata: {
          subscriptionId: view.id,
          chargeDate,
          url: `/subscriptions?id=${view.id}`,
        },
      });
    }
    return pending;
  }

  async remove(userId: string, id: string) {
    await this.demo.assertNotDemo(userId, DEMO_SUBSCRIPTION_MESSAGE);
    const existing = await this.findOwned(userId, id);
    await this.prisma.subscription.delete({ where: { id: existing.id } });
    return { message: 'Subscription removed' };
  }

  private async findOwned(userId: string, id: string) {
    const row = await this.prisma.subscription.findFirst({
      where: { id, userId },
      include: priceInclude,
    });
    if (!row) throw new NotFoundException('Subscription not found');
    return row;
  }

  private patchData(existing: OwnedSubscription, dto: UpdateSubscriptionDto) {
    const data: {
      service?: string;
      plan?: string | null;
      amount?: string;
      currency?: string;
      intervalUnit?: SubscriptionIntervalUnit;
      intervalCount?: number;
      nextChargeAt?: Date;
      trialEndsAt?: Date | null;
      status?: string;
      reason?: string | null;
      cancelUrl?: string | null;
      reminderDays?: number;
      paymentLabel?: string | null;
      prices?: { create: { amount: string; currency: string } };
    } = {};

    if (dto.service !== undefined) data.service = dto.service.trim();
    if (dto.plan !== undefined) data.plan = blankToNull(dto.plan);
    if (dto.intervalUnit !== undefined) data.intervalUnit = dto.intervalUnit;
    if (dto.intervalCount !== undefined) data.intervalCount = dto.intervalCount;
    if (dto.nextChargeAt !== undefined) {
      data.nextChargeAt = new Date(dto.nextChargeAt);
    }
    if (dto.trialEndsAt !== undefined) {
      data.trialEndsAt = dto.trialEndsAt ? new Date(dto.trialEndsAt) : null;
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.reason !== undefined) data.reason = blankToNull(dto.reason);
    if (dto.cancelUrl !== undefined)
      data.cancelUrl = blankToNull(dto.cancelUrl);
    if (dto.reminderDays !== undefined) data.reminderDays = dto.reminderDays;
    if (dto.paymentLabel !== undefined) {
      data.paymentLabel = blankToNull(dto.paymentLabel);
    }

    const nextAmount =
      dto.amount === undefined ? null : formatMoney(dto.amount);
    const nextCurrency =
      dto.currency === undefined ? null : dto.currency.trim().toUpperCase();
    if (nextAmount !== null || nextCurrency !== null) {
      const amount = nextAmount ?? formatMoney(existing.amount);
      const currency = nextCurrency ?? existing.currency.trim().toUpperCase();
      if (
        amount !== formatMoney(existing.amount) ||
        currency !== existing.currency.trim().toUpperCase()
      ) {
        data.amount = amount;
        data.currency = currency;
        data.prices = { create: { amount, currency } };
      }
    }

    return data;
  }
}

function assertChargeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Next charge date is invalid.');
  }
  if (startOfDay(date).getTime() < startOfDay(new Date()).getTime()) {
    throw new BadRequestException(
      'Next charge date cannot be in the past. Choose today or a later date.',
    );
  }
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
