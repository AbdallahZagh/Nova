import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chargeTimingLabel,
  daysLabel,
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
