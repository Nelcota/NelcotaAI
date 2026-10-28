import { describe, expect, test } from "bun:test";

import {
  formatMercadoPagoDate,
  fromMercadoPagoAmount,
  pixCodeOf,
  pixExpirationFrom,
  pixExpiresAt,
  toMercadoPagoAmount,
} from "./mercado-pago-values";

describe("toMercadoPagoAmount", () => {
  test("converts cents to reais", () => {
    const amountInCents = 15050;

    const amount = toMercadoPagoAmount(amountInCents);

    expect(amount).toBe(150.5);
  });

  test("throws RangeError for zero", () => {
    const amountInCents = 0;

    expect(() => toMercadoPagoAmount(amountInCents)).toThrow(RangeError);
  });

  test("throws RangeError for fractional cents", () => {
    const amountInCents = 10.5;

    expect(() => toMercadoPagoAmount(amountInCents)).toThrow(RangeError);
  });
});

describe("fromMercadoPagoAmount", () => {
  test("converts reais to cents without float noise", () => {
    const amountInReais = 0.29;

    const cents = fromMercadoPagoAmount(amountInReais);

    expect(cents).toBe(29);
  });

  test("throws RangeError for a negative amount", () => {
    const amountInReais = -1;

    expect(() => fromMercadoPagoAmount(amountInReais)).toThrow(RangeError);
  });

  test("throws RangeError for NaN", () => {
    const amountInReais = Number.NaN;

    expect(() => fromMercadoPagoAmount(amountInReais)).toThrow(RangeError);
  });
});

describe("pixExpirationFrom", () => {
  test("adds 30 minutes", () => {
    const now = new Date("2026-10-27T22:00:00Z");

    const expiration = pixExpirationFrom(now);

    expect(expiration.toISOString()).toBe("2026-10-27T22:30:00.000Z");
  });
});

describe("formatMercadoPagoDate", () => {
  test("writes UTC with an explicit offset", () => {
    const instant = new Date("2026-10-27T22:30:00Z");

    const text = formatMercadoPagoDate(instant);

    expect(text).toBe("2026-10-27T22:30:00.000+00:00");
  });

  test("throws RangeError for an invalid date", () => {
    const instant = new Date(Number.NaN);

    expect(() => formatMercadoPagoDate(instant)).toThrow(RangeError);
  });
});

describe("pixCodeOf", () => {
  test("returns the code carried by a Pix payment", () => {
    const payment = { point_of_interaction: { transaction_data: { qr_code: "000201…6304ABCD" } } };

    const code = pixCodeOf(payment);

    expect(code).toBe("000201…6304ABCD");
  });

  test("returns null for a payment without Pix data", () => {
    const payment = {};

    const code = pixCodeOf(payment);

    expect(code).toBeNull();
  });

  test("returns null for a blank code", () => {
    const payment = { point_of_interaction: { transaction_data: { qr_code: "   " } } };

    const code = pixCodeOf(payment);

    expect(code).toBeNull();
  });
});

describe("pixExpiresAt", () => {
  test("prefers the deadline sent by the provider", () => {
    const payment = { date_of_expiration: "2026-10-27T23:00:00.000+00:00" };

    const deadline = pixExpiresAt(payment, "2026-10-27T22:00:00Z");

    expect(deadline).toBe("2026-10-27T23:00:00.000+00:00");
  });

  test("falls back to the standard expiration after the request was created", () => {
    const payment = {};

    const deadline = pixExpiresAt(payment, "2026-10-27T22:00:00Z");

    expect(deadline).toBe("2026-10-27T22:30:00.000Z");
  });

  test("throws RangeError when the creation timestamp is invalid", () => {
    const payment = {};

    const act = () => pixExpiresAt(payment, "27/10/2026");

    expect(act).toThrow(RangeError);
  });
});
