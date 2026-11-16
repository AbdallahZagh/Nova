import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Subscription } from "./api/subscriptions.ts";
import {
  applyQuickAction,
  canMarkRenewed,
  chargeTimingLabel,
  daysLabel,
  EMPTY_SUBSCRIPTION_TOTALS,
  normalizeTotals,
  overdueLabel,
  subscriptionTimingLabel,
  formatMoney,
  formatMoneyList,
  intervalLabel,
  parseSubscriptionAmount,
} from "./subscriptions.ts";

describe("formatMoney", () => {
  it("falls back when the amount or currency cannot be formatted", () => {
    assert.equal(formatMoney("12.5", "US"), "12.5 US");
    assert.equal(formatMoney("nope", "USD"), "nope USD");
    assert.equal(formatMoney("", "USD"), "USD");
    assert.equal(formatMoney(null, null), "");
  });

  it("returns an empty string for empty totals", () => {
    assert.equal(formatMoneyList([]), "");
    assert.equal(formatMoneyList(null), "");
    assert.equal(formatMoneyList(undefined), "");
  });
});

describe("daysLabel", () => {
  it("labels today, one day, and several days", () => {
    assert.equal(daysLabel(0), "today");
    assert.equal(daysLabel(1), "in 1 day");
    assert.equal(daysLabel(6), "in 6 days");
  });
});

describe("intervalLabel", () => {
  it("uses a cadence name for one interval and a count otherwise", () => {
    assert.equal(intervalLabel("MONTH", 1), "Monthly");
    assert.equal(intervalLabel("week", 2), "Every 2 weeks");
    assert.equal(intervalLabel("YEAR", 3), "Every 3 years");
    assert.equal(intervalLabel("DAY", 1), "Daily");
    assert.equal(intervalLabel("nope", 2), "");
  });
});

describe("parseSubscriptionAmount", () => {
  it("rejects zero and junk, and keeps a positive amount", () => {
    assert.equal(parseSubscriptionAmount("0"), null);
    assert.equal(parseSubscriptionAmount("0.00"), null);
    assert.equal(parseSubscriptionAmount("abc"), null);
    assert.equal(parseSubscriptionAmount("12.345"), null);
    assert.equal(parseSubscriptionAmount("19.9"), "19.90");
  });
});

describe("chargeTimingLabel", () => {
  it("distinguishes a trial ending from an active renewal", () => {
    assert.equal(chargeTimingLabel("TRIAL", 0), "Trial ends today");
    assert.equal(chargeTimingLabel("TRIAL", 1), "Trial ends in 1 day");
    assert.equal(chargeTimingLabel("TRIAL", 4), "Trial ends in 4 days");
    assert.equal(chargeTimingLabel("ACTIVE", 0), "Renews today");
    assert.equal(chargeTimingLabel("ACTIVE", 1), "Renews in 1 day");
    assert.equal(chargeTimingLabel("ACTIVE", 3), "Renews in 3 days");
  });
});

function sample(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-1",
    service: "Netflix",
    plan: null,
    amount: "12.00",
    currency: "USD",
    intervalUnit: "MONTH",
    intervalCount: 1,
    nextChargeAt: new Date(2026, 9, 7, 12).toISOString(),
    trialEndsAt: null,
    status: "ACTIVE",
    reason: null,
    cancelUrl: null,
    reminderDays: 3,
    paymentLabel: null,
    lastCancelBy: new Date(2026, 9, 4, 12).toISOString(),
    monthlyEquivalent: "12.00",
    yearlyCost: "144.00",
    daysUntilCharge: -38,
    overdue: true,
    inWarningWindow: false,
    previousPrice: null,
    createdAt: new Date(2026, 0, 1).toISOString(),
    updatedAt: new Date(2026, 0, 1).toISOString(),
    ...overrides,
  };
}

describe("normalizeTotals", () => {
  it("keeps the monthly cost and the overdue count", () => {
    const totals = normalizeTotals({
      overdueCount: 2,
      monthly: [{ currency: "USD", amount: "40.00" }],
      yearly: [{ currency: "USD", amount: "480.00" }],
      dueIn30Days: [],
      activeCount: 5,
    });
    assert.equal(totals.overdueCount, 2);
    assert.deepEqual(totals.monthly, [{ currency: "USD", amount: "40.00" }]);
    assert.equal(totals.activeCount, 5);
  });

  it("falls back to empty totals and cleans bad values", () => {
    assert.equal(normalizeTotals(null), EMPTY_SUBSCRIPTION_TOTALS);
    const cleaned = normalizeTotals({ overdueCount: -3, activeCount: Number.NaN });
    assert.equal(cleaned.overdueCount, 0);
    assert.equal(cleaned.activeCount, 0);
    assert.deepEqual(cleaned.monthly, []);
  });
});

describe("overdue timing", () => {
  it("labels how late a charge is", () => {
    assert.equal(overdueLabel(-1), "1 day overdue");
    assert.equal(overdueLabel(-9), "9 days overdue");
  });

  it("shows one timing line per status", () => {
    assert.equal(subscriptionTimingLabel(sample({ daysUntilCharge: -3 })), "3 days overdue");
    assert.equal(
      subscriptionTimingLabel(sample({ overdue: false, daysUntilCharge: 4 })),
      "Renews in 4 days",
    );
    assert.equal(subscriptionTimingLabel(sample({ status: "PAUSED" })), "Paused");
    assert.equal(subscriptionTimingLabel(sample({ status: "CANCELED" })), "Canceled");
  });

  it("offers Mark renewed for passed or same-day charges of live subscriptions only", () => {
    assert.equal(canMarkRenewed(sample()), true);
    assert.equal(canMarkRenewed(sample({ overdue: false, daysUntilCharge: 0 })), true);
    assert.equal(canMarkRenewed(sample({ overdue: false, daysUntilCharge: 5 })), false);
    assert.equal(canMarkRenewed(sample({ status: "PAUSED" })), false);
  });
});

describe("applyQuickAction", () => {
  const now = new Date(2026, 10, 14, 10);

  it("renews a passed monthly charge to the next future date", () => {
    const renewed = applyQuickAction(sample(), "renew", now);
    const next = new Date(renewed.nextChargeAt);
    assert.equal(next.getMonth(), 11);
    assert.equal(next.getDate(), 7);
    assert.equal(renewed.daysUntilCharge, 23);
    assert.equal(renewed.overdue, false);
  });

  it("moves a charge dated today a full cycle ahead", () => {
    const today = sample({
      overdue: false,
      daysUntilCharge: 0,
      nextChargeAt: new Date(2026, 10, 14, 12).toISOString(),
    });
    const renewed = applyQuickAction(today, "renew", now);
    const next = new Date(renewed.nextChargeAt);
    assert.equal(next.getMonth(), 11);
    assert.equal(next.getDate(), 14);
    assert.equal(renewed.daysUntilCharge, 30);
  });

  it("turns an ended trial into a paid plan when renewed", () => {
    const renewed = applyQuickAction(
      sample({ status: "TRIAL", trialEndsAt: new Date(2026, 9, 7, 12).toISOString() }),
      "renew",
      now,
    );
    assert.equal(renewed.status, "ACTIVE");
  });

  it("pauses, resumes, and reactivates", () => {
    assert.equal(applyQuickAction(sample(), "pause", now).status, "PAUSED");
    assert.equal(applyQuickAction(sample({ status: "PAUSED" }), "resume", now).status, "ACTIVE");
    const back = applyQuickAction(
      sample({ status: "CANCELED", overdue: false, daysUntilCharge: 9 }),
      "reactivate",
      now,
    );
    assert.equal(back.status, "ACTIVE");
    assert.equal(back.overdue, false);
  });
});
