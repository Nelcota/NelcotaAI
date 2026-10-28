import { describe, expect, test } from "bun:test";

import { NelcotaError } from "@nelcota/client";

import {
  isDefinitivePaymentFailure,
  isExpectedFailure,
  paymentFailureReasonOf,
} from "./payment-failure";
import {
  DuplicatePaymentError,
  MercadoPagoApiError,
  PaymentsNotConfiguredError,
  PayerNotFoundError,
  TopupRequestNotFoundError,
} from "./payments.errors";

function databaseError(sqlstate: string): NelcotaError {
  return new NelcotaError({ status: 400, code: "db_error", message: "server text", sqlstate });
}

describe("paymentFailureReasonOf", () => {
  test("reports a persisted duplicate as terminal and expected", () => {
    const error = new DuplicatePaymentError();

    expect(paymentFailureReasonOf(error)).toBe("duplicate_payment");
    expect(isDefinitivePaymentFailure(error)).toBe(true);
    expect(isExpectedFailure("duplicate_payment")).toBe(true);
  });
  test("reports missing configuration", () => {
    const error = new PaymentsNotConfiguredError(null);

    const reason = paymentFailureReasonOf(error);

    expect(reason).toBe("not_configured");
  });

  test("reports a Mercado Pago failure as a gateway error", () => {
    const error = new MercadoPagoApiError("create payment", 500, "boom");

    const reason = paymentFailureReasonOf(error);

    expect(reason).toBe("gateway_error");
  });

  test("reports an account without an organization as not found", () => {
    const error = new PayerNotFoundError();

    expect(paymentFailureReasonOf(error)).toBe("not_found");
  });

  test("reports a request the caller cannot see", () => {
    const error = new TopupRequestNotFoundError("some-id");

    const reason = paymentFailureReasonOf(error);

    expect(reason).toBe("not_found");
  });

  test("reports an expired session", () => {
    const error = new NelcotaError({ status: 401, code: "invalid_token", message: "expired" });

    const reason = paymentFailureReasonOf(error);

    expect(reason).toBe("session_expired");
  });

  test("maps an out-of-range amount", () => {
    const error = databaseError("22023");

    const reason = paymentFailureReasonOf(error);

    expect(reason).toBe("invalid_amount");
  });

  test("maps a blocked organization", () => {
    const error = databaseError("P0010");

    const reason = paymentFailureReasonOf(error);

    expect(reason).toBe("organization_blocked");
  });

  test("maps too many pending requests", () => {
    const error = databaseError("P0015");

    const reason = paymentFailureReasonOf(error);

    expect(reason).toBe("too_many_pending");
  });

  test("reports a duplicate payment identity as a definite conflict", () => {
    const error = databaseError("P0017");

    expect(paymentFailureReasonOf(error)).toBe("duplicate_payment");
    expect(isDefinitivePaymentFailure(error)).toBe(true);
    expect(isExpectedFailure("duplicate_payment")).toBe(true);
  });

  test("treats an unknown SQLSTATE as a gateway error", () => {
    const error = databaseError("XX000");

    const reason = paymentFailureReasonOf(error);

    expect(reason).toBe("gateway_error");
  });

  test("treats anything else as a gateway error", () => {
    const error = new Error("unexpected");

    const reason = paymentFailureReasonOf(error);

    expect(reason).toBe("gateway_error");
  });
});

describe("isExpectedFailure", () => {
  test("considers a blocked organization expected", () => {
    const reason = "organization_blocked";

    const isExpected = isExpectedFailure(reason);

    expect(isExpected).toBe(true);
  });

  test("considers a gateway error unexpected", () => {
    const reason = "gateway_error";

    const isExpected = isExpectedFailure(reason);

    expect(isExpected).toBe(false);
  });
});
