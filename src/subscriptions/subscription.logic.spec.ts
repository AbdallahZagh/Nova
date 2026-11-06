import {
  formatMoney,
  lastCancelBy,
  metadataChargeKey,
  monthlyEquivalent,
  rollChargeDate,
  shouldRoll,
  summarizeSubscriptions,
  yearlyCost,
} from './subscription.logic';

describe('subscription logic', () => {
  const now = new Date(2026, 10, 6, 12);

  it('reads a Prisma decimal without calling toFixed unbound', () => {
    const decimal = {
      toString() {
        return '48.00';
      },
      toFixed() {
        throw new TypeError("Cannot read properties of undefined (reading 'constructor')");
      },
    };
    expect(formatMoney(decimal)).toBe('48.00');
  });

  it('turns month, year, and week prices into a monthly amount', () => {
    expect(monthlyEquivalent('20.00', 'MONTH', 1)).toBe('20.00');
    expect(yearlyCost('20.00', 'MONTH', 1)).toBe('240.00');
    expect(monthlyEquivalent('120.00', 'YEAR', 1)).toBe('10.00');
    expect(yearlyCost('120.00', 'YEAR', 1)).toBe('120.00');
    expect(monthlyEquivalent('10.00', 'WEEK', 1)).toBe('43.33');
    expect(yearlyCost('10.00', 'WEEK', 1)).toBe('520.00');
    expect(monthlyEquivalent('10.00', 'WEEK', 2)).toBe('21.67');
    expect(yearlyCost('10.00', 'WEEK', 2)).toBe('260.00');
    expect(yearlyCost('10.00', 'MONTH', 1)).toBe('120.00');
  });

  it('keeps currencies separate and rolls a past monthly date forward', () => {
    const totals = summarizeSubscriptions(
      [
        snapshot('usd', '20.00', new Date(2026, 10, 10)),
        snapshot('USD', '5.00', new Date(2026, 10, 12)),
        snapshot('EUR', '10.00', new Date(2026, 10, 20)),
        snapshot('USD', '99.00', new Date(2027, 5, 1)),
        snapshot('USD', '50.00', new Date(2026, 10, 8), 'PAUSED'),
      ],
      now,
    );
    expect(totals.dueIn30Days).toEqual([
      { currency: 'EUR', amount: '10.00' },
      { currency: 'USD', amount: '25.00' },
    ]);
    expect(totals.yearly).toEqual([
      { currency: 'EUR', amount: '120.00' },
      { currency: 'USD', amount: '1488.00' },
    ]);
    expect(totals.activeCount).toBe(4);

    const rolled = rollChargeDate(new Date(2026, 8, 6), 'MONTH', 1, now);
    expect(rolled.getMonth()).toBe(10);
    expect(rolled.getDate()).toBe(6);
    expect(shouldRoll('PAUSED', new Date(2026, 8, 6), now)).toBe(false);
    expect(lastCancelBy(new Date(2026, 10, 15, 18))).toBe('2026-11-14');

    const capped = rollChargeDate(new Date(1990, 0, 1, 8), 'DAY', 1, now);
    expect(capped.getFullYear()).toBe(2026);
    expect(capped.getMonth()).toBe(10);
    expect(capped.getDate()).toBe(6);
  });

  it('recognizes a reminder that was already sent for this charge', () => {
    const chargeDate = new Date('2026-11-08T00:00:00.000Z').toISOString();
    expect(metadataChargeKey({ subscriptionId: 'sub-1', chargeDate })).toBe(
      `sub-1::${new Date(chargeDate).toISOString()}`,
    );
    expect(metadataChargeKey({ subscriptionId: 'sub-1' })).toBeNull();
  });
});

function snapshot(
  currency: string,
  amount: string,
  nextChargeAt: Date,
  status = 'ACTIVE',
) {
  return {
    id: `${currency}-${amount}-${status}`,
    service: 'Cursor',
    plan: null,
    amount,
    currency,
    intervalUnit: 'MONTH' as const,
    intervalCount: 1,
    nextChargeAt,
    trialEndsAt: null,
    status,
    reason: null,
    cancelUrl: null,
    reminderDays: 3,
    paymentLabel: null,
    createdAt: nextChargeAt,
    updatedAt: nextChargeAt,
    prices: [],
  };
}
