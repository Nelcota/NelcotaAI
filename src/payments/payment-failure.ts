import { NelcotaError } from "@nelcota/client";

import {
  DuplicatePaymentError,
  MercadoPagoApiError,
  PaymentPendingError,
  PaymentAttemptClosedError,
  PaymentsNotConfiguredError,
  PayerNotFoundError,
  TopupRequestNotFoundError,
} from "./payments.errors";

/** Why a payment call failed, in terms the checkout screen can explain. */
export type PaymentFailureReason =
  | "not_configured"
  | "session_expired"
  | "invalid_amount"
  | "organization_blocked"
  | "too_many_pending"
  | "not_found"
  | "gateway_error"
  | "payment_in_progress"
  | "duplicate_payment"
  | "attempt_closed";

// SQLSTATEs raised by the online top-up database functions, plus the auth error codes.
const REASONS_BY_SQLSTATE: ReadonlyMap<string, PaymentFailureReason> = new Map([
  ["22023", "invalid_amount"],
  ["P0010", "organization_blocked"],
  ["P0015", "too_many_pending"],
  ["P0017", "duplicate_payment"],
  ["P0020", "payment_in_progress"],
  ["P0002", "not_found"],
  ["42501", "session_expired"],
]);
const SESSION_ERROR_CODES: ReadonlySet<string> = new Set(["invalid_token", "invalid_grant"]);

/**
 * Classifies an error thrown while starting or checking a payment.
 *
 * @param error - Whatever was thrown.
 * @returns The reason to show; anything unexpected counts as a gateway error.
 */
export function paymentFailureReasonOf(error: unknown): PaymentFailureReason {
  if (error instanceof DuplicatePaymentError) return "duplicate_payment";
  if (error instanceof PaymentAttemptClosedError) return "attempt_closed";
  if (error instanceof PaymentPendingError) return "payment_in_progress";
  if (error instanceof PaymentsNotConfiguredError) {
    return "not_configured";
  }
  if (error instanceof TopupRequestNotFoundError || error instanceof PayerNotFoundError) {
    return "not_found";
  }
  if (error instanceof MercadoPagoApiError) {
    return "gateway_error";
  }
  if (error instanceof NelcotaError) {
    if (SESSION_ERROR_CODES.has(error.code)) {
      return "session_expired";
    }
    return REASONS_BY_SQLSTATE.get(error.sqlstate ?? "") ?? "gateway_error";
  }
  return "gateway_error";
}

/** Reasons that are part of normal use and need no log entry. */
export function isExpectedFailure(reason: PaymentFailureReason): boolean {
  return reason !== "gateway_error" && reason !== "not_configured";
}

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const DEFINITIVE_REFUSALS: ReadonlySet<number> = new Set([
  HTTP_BAD_REQUEST,
  HTTP_UNAUTHORIZED,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_UNPROCESSABLE_ENTITY,
]);

/** Terminal attempts, duplicate identities and explicit refusals need no creation recovery. */
export function isDefinitivePaymentFailure(error: unknown): boolean {
  return (
    error instanceof DuplicatePaymentError ||
    error instanceof PaymentAttemptClosedError ||
    (error instanceof NelcotaError && error.sqlstate === "P0017") ||
    (error instanceof MercadoPagoApiError && DEFINITIVE_REFUSALS.has(error.httpStatus))
  );
}
