import { CENTS_PER_REAL } from "@/shared/money";

import type { MercadoPagoPayment } from "./mercado-pago.api";

/**
 * How long a Pix QR code stays payable after it is issued. Mercado Pago accepts a deadline
 * between 30 minutes and 30 days after creation.
 */
export const PIX_EXPIRATION_IN_MINUTES = 30;
const MS_PER_MINUTE = 60_000;

/**
 * Converts cents to the decimal amount in reais that the Mercado Pago API expects.
 *
 * @param amountInCents - Positive integer amount in cents.
 * @returns The amount in reais, such as `150.5` for 15050 cents.
 * @throws {RangeError} When the amount is not a positive safe integer.
 */
export function toMercadoPagoAmount(amountInCents: number): number {
  if (Number.isSafeInteger(amountInCents) === false || amountInCents <= 0) {
    throw new RangeError(`expected positive integer cents, got ${amountInCents}`);
  }
  return amountInCents / CENTS_PER_REAL;
}

/**
 * Converts a Mercado Pago amount in reais back to cents, rounding away float noise.
 *
 * @param amountInReais - Amount as returned by the API, such as `150.5`.
 * @returns The amount in cents.
 * @throws {RangeError} When the amount is negative or not finite.
 */
export function fromMercadoPagoAmount(amountInReais: number): number {
  const cents = Math.round(amountInReais * CENTS_PER_REAL);
  if (Number.isFinite(cents) === false || cents < 0) {
    throw new RangeError(`expected a non-negative amount in reais, got ${amountInReais}`);
  }
  return cents;
}

/**
 * Deadline for paying a new Pix code.
 *
 * @param now - Current instant.
 * @returns The instant 30 minutes later.
 */
export function pixExpirationFrom(now: Date): Date {
  return new Date(now.getTime() + PIX_EXPIRATION_IN_MINUTES * MS_PER_MINUTE);
}

/**
 * Writes an instant in the format of `date_of_expiration`: ISO 8601 in UTC with milliseconds
 * and an explicit `+00:00` offset.
 *
 * @param instant - The instant to write.
 * @returns Text such as `2026-10-27T22:30:00.000+00:00`.
 * @throws {RangeError} When the date is invalid.
 */
export function formatMercadoPagoDate(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("cannot format an invalid date for Mercado Pago");
  }
  return instant.toISOString().replace(/Z$/, "+00:00");
}

type PixPayment = Pick<MercadoPagoPayment, "point_of_interaction" | "date_of_expiration">;

/**
 * The Pix "copia e cola" code of a payment.
 *
 * @param payment - A payment as returned by Mercado Pago.
 * @returns The code, or null when the payment carries none (card payments, or a Pix creation
 * whose response was lost).
 */
export function pixCodeOf(payment: PixPayment): string | null {
  const qrCode = payment.point_of_interaction?.transaction_data?.qr_code;
  if (qrCode == null || qrCode.trim() === "") {
    return null;
  }
  return qrCode;
}

/**
 * The deadline for paying a Pix code, as an ISO timestamp.
 *
 * @param payment - A payment as returned by Mercado Pago.
 * @param createdAt - ISO timestamp of the top-up request, used when the provider sent no
 * deadline: the code was issued with the standard expiration from that instant.
 * @returns The deadline as an ISO 8601 timestamp.
 * @throws {RangeError} When `createdAt` is not a valid timestamp.
 */
export function pixExpiresAt(payment: PixPayment, createdAt: string): string {
  if (payment.date_of_expiration != null) {
    return payment.date_of_expiration;
  }
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    throw new RangeError(`expected an ISO timestamp for the request creation, got "${createdAt}"`);
  }
  return pixExpirationFrom(created).toISOString();
}
