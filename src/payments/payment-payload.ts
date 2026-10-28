import { z } from "zod";

import { taxDocumentSchema, taxDocumentTypeOf } from "@/shared/tax-document";

import { formatMercadoPagoDate, toMercadoPagoAmount } from "./mercado-pago-values";
import type { CreatePaymentBody } from "./mercado-pago.api";

const PAYMENT_DESCRIPTION = "Créditos de IA - Nelcota AI";
// Shown on the card statement; short and recognizable to avoid chargebacks.
const STATEMENT_DESCRIPTOR = "NELCOTA AI";
const WEBHOOK_PATH = "/api/mercado-pago/webhook";

/** Who pays, as the payment payloads need it. */
interface PayerDetails {
  readonly email: string;
  /** CPF (11 digits) or CNPJ (14 digits) of the organization or the cardholder. */
  readonly document: string;
}

const MAX_CARD_TOKEN_LENGTH = 200;
/** Most instalments a card top-up may be split into; interest is paid by the cardholder. */
export const MAX_INSTALLMENTS = 12;
const MAX_IDENTIFIER_LENGTH = 40;

/** Validates tokenized card details before a pending request can be allocated. */
export const cardDetailsSchema = z.object({
  token: z.string().trim().min(1).max(MAX_CARD_TOKEN_LENGTH),
  installments: z.number().int().min(1).max(MAX_INSTALLMENTS),
  paymentMethodId: z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH),
  issuerId: z
    .string()
    .regex(/^\d+$/)
    .max(MAX_IDENTIFIER_LENGTH)
    .refine((value) => Number.isSafeInteger(Number(value)) && Number(value) > 0)
    .nullable(),
  cardholderDocument: taxDocumentSchema,
});

/** A validated tokenized card, without raw card details. */
export type CardDetails = z.infer<typeof cardDetailsSchema>;

/**
 * The webhook address Mercado Pago should call, or nothing when the app is not public over
 * HTTPS (Mercado Pago refuses plain HTTP and localhost). Payments then rely on polling.
 *
 * @param appUrl - Public URL of this app.
 * @returns The webhook URL, or undefined.
 */
export function notificationUrlFor(appUrl: string): string | undefined {
  const url = new URL(WEBHOOK_PATH, appUrl);
  if (url.protocol !== "https:" || url.hostname === "localhost") {
    return undefined;
  }
  return url.toString();
}

/**
 * Builds the body of a Pix payment for a top-up request.
 *
 * @param requestId - Top-up request id, sent as `external_reference`.
 * @param amountInCents - Amount of the request, in cents.
 * @param payer - Account e-mail and organization CPF/CNPJ.
 * @param expiresAt - Deadline for paying the code.
 * @param notificationUrl - Webhook address, when the app is public.
 * @returns The request body for `POST /v1/payments`.
 */
export function pixPaymentBody(
  requestId: string,
  amountInCents: number,
  payer: PayerDetails,
  expiresAt: Date,
  notificationUrl: string | undefined,
): CreatePaymentBody {
  return {
    transaction_amount: toMercadoPagoAmount(amountInCents),
    description: PAYMENT_DESCRIPTION,
    payment_method_id: "pix",
    external_reference: requestId,
    payer: payerOf(payer),
    date_of_expiration: formatMercadoPagoDate(expiresAt),
    ...(notificationUrl == null ? {} : { notification_url: notificationUrl }),
  };
}

/**
 * Builds the body of a card payment for a top-up request. The amount always comes from the
 * request, never from the browser.
 *
 * @param requestId - Top-up request id, sent as `external_reference`.
 * @param amountInCents - Amount of the request, in cents.
 * @param email - Account e-mail.
 * @param card - Tokenized card and installments chosen in the card form.
 * @param notificationUrl - Webhook address, when the app is public.
 * @returns The request body for `POST /v1/payments`.
 */
export function cardPaymentBody(
  requestId: string,
  amountInCents: number,
  email: string,
  card: CardDetails,
  notificationUrl: string | undefined,
): CreatePaymentBody {
  return {
    transaction_amount: toMercadoPagoAmount(amountInCents),
    description: PAYMENT_DESCRIPTION,
    payment_method_id: card.paymentMethodId,
    external_reference: requestId,
    payer: payerOf({ email, document: card.cardholderDocument }),
    token: card.token,
    installments: card.installments,
    statement_descriptor: STATEMENT_DESCRIPTOR,
    ...(card.issuerId == null ? {} : { issuer_id: card.issuerId }),
    ...(notificationUrl == null ? {} : { notification_url: notificationUrl }),
  };
}

function payerOf(payer: PayerDetails): CreatePaymentBody["payer"] {
  return {
    email: payer.email,
    identification: {
      type: taxDocumentTypeOf(payer.document),
      number: payer.document,
    },
  };
}
