import type { refreshTopupPaymentFn } from "@/payments";

type PaymentCheck = Awaited<ReturnType<typeof refreshTopupPaymentFn>>;

/** Keeps resolved duplicates distinct from retryable checks and ordinary Pix expiration. */
export function pixPaymentStatus(result: PaymentCheck) {
  if (result.ok) return result.status;
  return result.reason === "duplicate_payment" ? "duplicate" : "pending";
}
