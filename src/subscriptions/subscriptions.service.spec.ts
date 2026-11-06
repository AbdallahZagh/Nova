import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { SubscriptionIntervalUnit } from '../generated/prisma/enums.js';
import { DemoService } from '../demo/demo.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';
import { startOfDay } from './subscription.logic';

type PriceRow = {
  id: string;
  subscriptionId: string;
  amount: string;
  currency: string;
  changedAt: Date;
};

type SubRow = {
  id: string;
  userId: string;
  service: string;
  plan: string | null;
  amount: string;
  currency: string;
  intervalUnit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  intervalCount: number;
  nextChargeAt: Date;
  trialEndsAt: Date | null;
  status: string;
  reason: string | null;
  cancelUrl: string | null;
  reminderDays: number;
  paymentLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Note = {
  type: string;
  createdAt: Date;
  metadata: unknown;
};

type Where = {
  id?: string;
  userId?: string;
  status?: { in?: string[] };
  type?: string;
  createdAt?: { gte?: Date };
};

function daysFromToday(days: number, hour = 12) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function memory() {
  const subscriptions: SubRow[] = [];
  const prices: PriceRow[] = [];
  const notes: Note[] = [];
  const users: { id: string; isDemo: boolean }[] = [
    { id: 'user-1', isDemo: false },
  ];
  let sequence = 0;
  let clock = Date.parse('2026-01-01T00:00:00.000Z');
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const stamp = () => {
    clock += 1000;
    return new Date(clock);
  };

  function matches(row: SubRow, where?: Where) {
    if (!where) return true;
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.userId !== undefined && row.userId !== where.userId) return false;
    if (where.status?.in && !where.status.in.includes(row.status)) return false;
    return true;
  }

  function withPrices(row: SubRow) {
    const attached = prices
      .filter((price) => price.subscriptionId === row.id)
      .sort(
        (a, b) =>
          a.changedAt.getTime() - b.changedAt.getTime() ||
          a.id.localeCompare(b.id),
      );
    return { ...row, prices: attached };
  }

  function writePrices(subscriptionId: string, create: unknown) {
    const creates = Array.isArray(create) ? create : [create];
    for (const price of creates) {
      const row = price as { amount: string; currency: string };
      prices.push({
        id: nextId('price'),
        subscriptionId,
        amount: row.amount,
        currency: row.currency,
        changedAt: stamp(),
      });
    }
  }

  const notificationFindMany = jest.fn(
    ({ where }: { where?: Where; select?: { metadata?: boolean } }) =>
      notes
        .filter((note) => {
          if (where?.type && note.type !== where.type) return false;
          if (where?.createdAt?.gte && note.createdAt < where.createdAt.gte) {
            return false;
          }
          return true;
        })
        .map((note) => ({ metadata: note.metadata })),
  );

  const prisma = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        users.find((user) => user.id === where.id) ?? null,
    },
    subscription: {
      create: ({
        data,
        include,
      }: {
        data: SubRow & { prices?: { create: unknown } };
        include?: { prices?: unknown };
      }) => {
        const row: SubRow = {
          id: nextId('sub'),
          userId: data.userId,
          service: data.service,
          plan: data.plan ?? null,
          amount: String(data.amount),
          currency: data.currency,
          intervalUnit: data.intervalUnit,
          intervalCount: data.intervalCount,
          nextChargeAt: data.nextChargeAt,
          trialEndsAt: data.trialEndsAt ?? null,
          status: data.status ?? 'ACTIVE',
          reason: data.reason ?? null,
          cancelUrl: data.cancelUrl ?? null,
          reminderDays: data.reminderDays ?? 3,
          paymentLabel: data.paymentLabel ?? null,
          createdAt: stamp(),
          updatedAt: stamp(),
        };
        subscriptions.push(row);
        if (data.prices?.create) writePrices(row.id, data.prices.create);
        return include?.prices ? withPrices(row) : { ...row };
      },
      findMany: ({
        where,
        include,
      }: {
        where?: Where;
        include?: { prices?: unknown };
      }) =>
        subscriptions
          .filter((row) => matches(row, where))
          .map((row) => (include?.prices ? withPrices(row) : { ...row })),
      findFirst: ({
        where,
        include,
      }: {
        where?: Where;
        include?: { prices?: unknown };
      }) => {
        const row = subscriptions.find((item) => matches(item, where));
        if (!row) return null;
        return include?.prices ? withPrices(row) : { ...row };
      },
      update: ({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: Partial<SubRow> & { prices?: { create: unknown } };
        include?: { prices?: unknown };
      }) => {
        const row = subscriptions.find((item) => item.id === where.id);
        if (!row) throw new Error('missing subscription');
        const { prices: priceWrite, ...rest } = data;
        Object.assign(row, rest, { updatedAt: stamp() });
        if (priceWrite?.create) writePrices(row.id, priceWrite.create);
        return include?.prices ? withPrices(row) : { ...row };
      },
      delete: ({ where }: { where: { id: string } }) => {
        const index = subscriptions.findIndex((row) => row.id === where.id);
        if (index < 0) throw new Error('missing subscription');
        return subscriptions.splice(index, 1)[0];
      },
    },
    notification: { findMany: notificationFindMany },
  };

  function insert(
    partial: Partial<SubRow> & Pick<SubRow, 'userId' | 'status'>,
  ) {
    const row: SubRow = {
      id: partial.id ?? nextId('sub'),
      userId: partial.userId,
      service: partial.service ?? 'Netflix',
      plan: partial.plan ?? null,
      amount: partial.amount ?? '12.00',
      currency: partial.currency ?? 'USD',
      intervalUnit: partial.intervalUnit ?? 'MONTH',
      intervalCount: partial.intervalCount ?? 1,
      nextChargeAt: partial.nextChargeAt ?? daysFromToday(2),
      trialEndsAt: partial.trialEndsAt ?? null,
      status: partial.status,
      reason: partial.reason ?? null,
      cancelUrl: partial.cancelUrl ?? null,
      reminderDays: partial.reminderDays ?? 3,
      paymentLabel: partial.paymentLabel ?? null,
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    subscriptions.push(row);
    return row;
  }

  return {
    prisma,
    subscriptions,
    prices,
    notes,
    users,
    insert,
    notificationFindMany,
  };
}

function serviceFor(store: ReturnType<typeof memory>) {
  const demo = new DemoService(
    store.prisma as unknown as PrismaService,
    {} as never,
  );
  return new SubscriptionsService(
    store.prisma as unknown as PrismaService,
    demo,
  );
}

const monthInput = {
  service: 'Figma',
  amount: '20.00',
  currency: 'usd',
  intervalUnit: SubscriptionIntervalUnit.MONTH,
  nextChargeAt: daysFromToday(12).toISOString(),
};

describe('SubscriptionsService', () => {
  it('returns monthly, yearly, and weekly equivalents on create', async () => {
    const store = memory();
    const service = serviceFor(store);

    const monthly = await service.create('user-1', monthInput);
    expect(monthly.currency).toBe('USD');
    expect(monthly.amount).toBe('20.00');
    expect(monthly.monthlyEquivalent).toBe('20.00');
    expect(monthly.yearlyCost).toBe('240.00');
    expect(monthly.previousPrice).toBeNull();
    expect(monthly.reminderDays).toBe(3);

    const yearly = await service.create('user-1', {
      ...monthInput,
      service: 'Adobe',
      amount: '120.00',
      intervalUnit: SubscriptionIntervalUnit.YEAR,
    });
    expect(yearly.monthlyEquivalent).toBe('10.00');
    expect(yearly.yearlyCost).toBe('120.00');

    const weekly = await service.create('user-1', {
      ...monthInput,
      service: 'Gym',
      amount: '10.00',
      currency: 'eur',
      intervalUnit: SubscriptionIntervalUnit.WEEK,
    });
    expect(weekly.monthlyEquivalent).toBe('43.33');
    expect(weekly.yearlyCost).toBe('520.00');
    expect(weekly.currency).toBe('EUR');
  });

  it('keeps a previous price after the amount changes', async () => {
    const store = memory();
    const service = serviceFor(store);
    const created = await service.create('user-1', monthInput);

    await service.update('user-1', created.id, { plan: 'Pro' });
    expect(store.prices).toHaveLength(1);

    const updated = await service.update('user-1', created.id, {
      amount: '25.00',
    });
    expect(updated.amount).toBe('25.00');
    expect(updated.previousPrice).toEqual({
      amount: '20.00',
      currency: 'USD',
      changedAt: store.prices[0].changedAt.toISOString(),
    });
    expect(store.prices).toHaveLength(2);
  });

  it('sums the next 30 days separately by currency and rolls only active cycles', async () => {
    const store = memory();
    const service = serviceFor(store);
    store.insert({
      id: 'due-usd',
      userId: 'user-1',
      status: 'ACTIVE',
      amount: '10.00',
      currency: 'USD',
      nextChargeAt: daysFromToday(0),
      reminderDays: 3,
    });
    store.insert({
      id: 'due-eur',
      userId: 'user-1',
      status: 'ACTIVE',
      service: 'Spotify',
      amount: '7.00',
      currency: 'EUR',
      nextChargeAt: daysFromToday(3),
      reminderDays: 1,
    });
    store.insert({
      id: 'trial',
      userId: 'user-1',
      status: 'TRIAL',
      amount: '5.50',
      currency: 'USD',
      nextChargeAt: daysFromToday(30),
    });
    store.insert({
      id: 'later',
      userId: 'user-1',
      status: 'ACTIVE',
      amount: '9.00',
      currency: 'USD',
      nextChargeAt: daysFromToday(31),
    });
    const pausedAt = daysFromToday(-40, 9);
    store.insert({
      id: 'paused',
      userId: 'user-1',
      status: 'PAUSED',
      amount: '100.00',
      currency: 'USD',
      nextChargeAt: pausedAt,
    });
    store.insert({
      id: 'canceled',
      userId: 'user-1',
      status: 'CANCELED',
      amount: '4.00',
      currency: 'EUR',
      nextChargeAt: daysFromToday(0),
    });

    const listed = await service.list('user-1');
    expect(listed.totals.dueIn30Days).toEqual([
      { currency: 'EUR', amount: '7.00' },
      { currency: 'USD', amount: '15.50' },
    ]);
    expect(listed.totals.yearly).toEqual([
      { currency: 'EUR', amount: '84.00' },
      { currency: 'USD', amount: '294.00' },
    ]);
    expect(listed.totals.activeCount).toBe(4);
    expect(listed.items.map((item) => item.id)).toEqual([
      'due-usd',
      'due-eur',
      'trial',
      'later',
      'paused',
      'canceled',
    ]);
    expect(
      store.subscriptions
        .find((row) => row.id === 'paused')!
        .nextChargeAt.getTime(),
    ).toBe(pausedAt.getTime());

    const dashboard = await service.getDashboard('user-1');
    expect(dashboard.next?.id).toBe('due-usd');
    expect(dashboard.upcoming.map((item) => item.id)).toEqual([
      'due-usd',
      'due-eur',
      'trial',
    ]);
    expect(dashboard.alerts.map((item) => item.id)).toEqual(['due-usd']);
    expect(dashboard.dueIn30Days).toEqual(listed.totals.dueIn30Days);
  });

  it('keeps the charge date the user saved, even when it is in the past', async () => {
    const store = memory();
    const service = serviceFor(store);
    const past = daysFromToday(-3, 9);
    const active = store.insert({
      id: 'stale',
      userId: 'user-1',
      status: 'ACTIVE',
      intervalUnit: 'MONTH',
      intervalCount: 1,
      nextChargeAt: new Date(past.getTime()),
    });
    const original = active.nextChargeAt.getTime();

    const listed = await service.list('user-1');

    expect(active.nextChargeAt.getTime()).toBe(original);
    expect(new Date(listed.items[0].nextChargeAt).getDate()).toBe(past.getDate());
    expect(new Date(listed.items[0].nextChargeAt).getMonth()).toBe(past.getMonth());
  });

  it('refuses demo writes and hides another user’s subscription', async () => {
    const store = memory();
    store.users.push({ id: 'demo', isDemo: true });
    const service = serviceFor(store);

    await expect(service.create('demo', monthInput)).rejects.toThrow(
      'The demo account cannot manage subscriptions.',
    );
    await expect(
      service.update('demo', 'missing', { plan: 'Pro' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('demo', 'missing')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(store.subscriptions).toHaveLength(0);

    const created = await service.create('user-1', monthInput);
    await expect(service.get('user-2', created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('user-2', created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('user-1', created.id)).resolves.toEqual({
      message: 'Subscription removed',
    });
    expect(store.subscriptions).toHaveLength(0);

    store.insert({ userId: 'demo', status: 'ACTIVE' });
    await expect(service.list('demo')).resolves.toMatchObject({
      totals: { activeCount: 1 },
    });
  });

  it('sends a subscription reminder once per charge and skips an old duplicate', async () => {
    const store = memory();
    const service = serviceFor(store);
    const charge = daysFromToday(2);
    store.insert({
      id: 'sub-1',
      userId: 'user-1',
      status: 'ACTIVE',
      service: 'Netflix',
      amount: '12.00',
      currency: 'USD',
      nextChargeAt: charge,
      reminderDays: 3,
    });
    store.notes.push({
      type: 'SUBSCRIPTION_CHARGE_SOON',
      createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      metadata: {
        subscriptionId: 'sub-1',
        chargeDate: charge.toISOString(),
      },
    });

    const first = await service.remindDue();
    expect(first).toEqual([
      {
        userId: 'user-1',
        title: 'Renews soon',
        body: 'Netflix renews in 2 days · 12.00 USD.',
        metadata: {
          subscriptionId: 'sub-1',
          chargeDate: charge.toISOString(),
          url: '/subscriptions?id=sub-1',
        },
      },
    ]);
    const since = store.notificationFindMany.mock.calls[0][0].where?.createdAt
      ?.gte as Date;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(
      120 * 24 * 60 * 60 * 1000,
    );

    store.notes.push({
      type: 'SUBSCRIPTION_CHARGE_SOON',
      createdAt: new Date(),
      metadata: first[0].metadata,
    });
    await expect(service.remindDue()).resolves.toEqual([]);

    store.notes[1].metadata = {
      subscriptionId: 'sub-1',
      chargeDate: daysFromToday(40).toISOString(),
    };
    const again = await service.remindDue();
    expect(again).toHaveLength(1);
    expect(again[0].metadata.chargeDate).toBe(charge.toISOString());
  });

  it('words a trial that ends today separately from the renewal copy', async () => {
    const store = memory();
    const service = serviceFor(store);
    const trialEndsAt = daysFromToday(0, 15);
    store.insert({
      id: 'trial-1',
      userId: 'user-1',
      status: 'TRIAL',
      service: 'Figma',
      amount: '20.00',
      currency: 'USD',
      nextChargeAt: daysFromToday(20),
      trialEndsAt,
      reminderDays: 3,
    });

    const [reminder] = await service.remindDue();
    expect(reminder.title).toBe('Trial ends soon');
    expect(reminder.body).toBe('Figma trial ends today, then 20.00 USD.');
    expect(reminder.metadata.chargeDate).toBe(trialEndsAt.toISOString());
  });
});

describe('CreateSubscriptionDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  function transform(body: Record<string, unknown>): Promise<unknown> {
    return pipe.transform(body, {
      type: 'body',
      metatype: CreateSubscriptionDto,
    }) as Promise<unknown>;
  }

  it('normalizes money and rejects a bad cancel link or reminder window', async () => {
    await expect(
      transform({
        service: '  Figma ',
        amount: '20',
        currency: 'usd',
        intervalUnit: 'MONTH',
        nextChargeAt: daysFromToday(4).toISOString(),
      }),
    ).resolves.toMatchObject({
      service: 'Figma',
      amount: '20.00',
      currency: 'USD',
    });

    await expect(
      transform({
        ...monthInput,
        cancelUrl: 'notaurl',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      transform({ ...monthInput, amount: '0.00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      transform({ ...monthInput, reminderDays: 91 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      transform({ ...monthInput, currency: 'US' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
