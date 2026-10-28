import { expect, test } from "bun:test";

import { pixPaymentStatus } from "./pix-payment-status";

test("shows a resolved duplicate instead of asking for another Pix payment", () => {
  expect(pixPaymentStatus({ ok: false, reason: "duplicate_payment" })).toBe("duplicate");
});

test("keeps retryable transport checks pending", () => {
  expect(pixPaymentStatus({ ok: false, reason: "gateway_error" })).toBe("pending");
});

test.each(["confirmed", "cancelled", "pending", "withdrawn"] as const)(
  "preserves the authoritative %s status",
  (status) => {
    expect(pixPaymentStatus({ ok: true, status })).toBe(status);
  },
);
