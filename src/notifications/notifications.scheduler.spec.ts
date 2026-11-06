import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsScheduler } from './notifications.scheduler';
import { NotificationsService } from './notifications.service';

describe('NotificationsScheduler subscription reminders', () => {
  it('notifies each reminder the subscription service still owes', async () => {
    const notifyUsers = jest.fn().mockResolvedValue(undefined);
    const remindDue = jest.fn().mockResolvedValue([
      {
        userId: 'user-1',
        title: 'Renews soon',
        body: 'Netflix renews in 2 days · 12.00 USD.',
        metadata: {
          subscriptionId: 'sub-1',
          chargeDate: '2026-11-08T12:00:00.000Z',
          url: '/subscriptions?id=sub-1',
        },
      },
    ]);
    const scheduler = new NotificationsScheduler(
      {} as PrismaService,
      { notifyUsers } as unknown as NotificationsService,
      { remindDue } as unknown as SubscriptionsService,
    );

    await scheduler.sendSubscriptionReminders();

    expect(remindDue).toHaveBeenCalledTimes(1);
    expect(notifyUsers).toHaveBeenCalledWith(
      ['user-1'],
      'SUBSCRIPTION_CHARGE_SOON',
      'Renews soon',
      'Netflix renews in 2 days · 12.00 USD.',
      {
        subscriptionId: 'sub-1',
        chargeDate: '2026-11-08T12:00:00.000Z',
        url: '/subscriptions?id=sub-1',
      },
    );
  });

  it('stays quiet when every due reminder was already sent', async () => {
    const notifyUsers = jest.fn().mockResolvedValue(undefined);
    const scheduler = new NotificationsScheduler(
      {} as PrismaService,
      { notifyUsers } as unknown as NotificationsService,
      {
        remindDue: jest.fn().mockResolvedValue([]),
      } as unknown as SubscriptionsService,
    );

    await scheduler.sendSubscriptionReminders();

    expect(notifyUsers).not.toHaveBeenCalled();
  });
});
