// The generator submodule excludes dynamic Pix's Node-only payload fetcher from the browser.
import { createEmv } from "pix-utils/dist/main/emvHandler";
import { PixElementType } from "pix-utils/dist/main/types/pixElements";

import { CENTS_PER_REAL } from "@/shared/money";

import { InvalidPixPaymentError } from "../topups.errors";

// The 99-character merchant account field includes 22 characters of Pix headers.
const MAX_PIX_KEY_LENGTH = 77;
const MAX_NAME_LENGTH = 25;
const MAX_CITY_LENGTH = 15;
const MAX_TXID_LENGTH = 25;

/** What the customer needs to pay one request. */
export interface PixPayment {
  /** Receiver's Pix key, exactly as registered at the bank. */
  readonly pixKey: string;
  /** Receiver's name; accents are removed and it is cut to 25 characters. */
  readonly receiverName: string;
  /** Receiver's city; accents are removed and it is cut to 15 characters. */
  readonly receiverCity: string;
  /** Amount in cents, a positive integer. */
  readonly amountInCents: number;
  /** Identifies the payment in the bank statement; letters and digits, up to 25. */
  readonly transactionId: string;
}

/**
 * Builds the Pix "copia e cola" code for a payment.
 *
 * @param payment - Receiver data, amount and transaction id.
 * @returns The BR Code text, ready to copy or to encode in a QR code.
 * @throws {InvalidPixPaymentError} When the key, name or city is empty, the amount is not a
 * positive integer, the transaction id has invalid characters or a field exceeds 99 characters.
 *
 * @example
 * buildPixCode({ pixKey: "financeiro@example.com", receiverName: "Nelcota", receiverCity: "SAO PAULO", amountInCents: 10000, transactionId: "PEDIDO1" });
 */
export function buildPixCode(payment: PixPayment): string {
  const pixKey = payment.pixKey.trim();
  const name = toBrCodeText(payment.receiverName, MAX_NAME_LENGTH);
  const city = toBrCodeText(payment.receiverCity, MAX_CITY_LENGTH);
  if (pixKey === "" || name === "" || city === "") {
    throw new InvalidPixPaymentError("pix key, receiver name and city are required");
  }
  if (Number.isSafeInteger(payment.amountInCents) === false || payment.amountInCents <= 0) {
    throw new InvalidPixPaymentError(
      `amount must be positive integer cents, got ${payment.amountInCents}`,
    );
  }
  if (/^[A-Za-z0-9]{1,25}$/.test(payment.transactionId) === false) {
    throw new InvalidPixPaymentError(
      `transaction id must have 1 to ${MAX_TXID_LENGTH} letters or digits, got "${payment.transactionId}"`,
    );
  }
  if (pixKey.length > MAX_PIX_KEY_LENGTH) {
    throw new InvalidPixPaymentError(`pix key exceeds ${MAX_PIX_KEY_LENGTH} characters`);
  }
  return createEmv({
    type: PixElementType.STATIC,
    merchantCategoryCode: "0000",
    transactionCurrency: "986",
    countryCode: "BR",
    pixKey,
    merchantName: name,
    merchantCity: city,
    transactionAmount: payment.amountInCents / CENTS_PER_REAL,
    txid: payment.transactionId,
  });
}

/**
 * Turns a request id into a Pix transaction id (letters and digits only, at most 25).
 *
 * @param requestId - The top-up request uuid.
 * @returns The id without hyphens, uppercase, cut to 25 characters.
 */
export function toTransactionId(requestId: string): string {
  return requestId
    .replaceAll(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, MAX_TXID_LENGTH);
}

// Banks read the code as plain ASCII: drop accents and anything outside printable ASCII.
function toBrCodeText(text: string, maxLength: number): string {
  return text
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .replaceAll(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, maxLength)
    .trim();
}
