import type { NelcotaClient } from "@nelcota/client";
import { z } from "zod";

import type { Database } from "@/shared/database";
import { TAX_DOCUMENT_DIGITS_PATTERN } from "@/shared/tax-document";

import { createPayment, findPaymentByReference, getPayment } from "./mercado-pago.api";
import { isDefinitivePaymentFailure } from "./payment-failure";
import { PaymentAttemptClosedError } from "./payments.errors";
import { claimPayment, type readRequest, releasePayment } from "./payments.repository";

/** Only the allowlisted gateway payload is persisted; raw card details are never accepted. */
export const storedPaymentBodySchema = z
  .object({
    transaction_amount: z.number().positive(),
    description: z.string().min(1),
    payment_method_id: z.string().min(1),
    external_reference: z.uuid(),
    payer: z.object({
      email: z.email(),
      identification: z.object({
        type: z.enum(["CPF", "CNPJ"]),
        number: z.string().regex(TAX_DOCUMENT_DIGITS_PATTERN),
      }),
    }),
    issuer_id: z.string().regex(/^\d+$/).optional(),
    token: z.string().optional(),
    installments: z.number().int().positive().optional(),
    statement_descriptor: z.string().optional(),
    notification_url: z.url().optional(),
    date_of_expiration: z.string().optional(),
  })
  // With exactOptionalPropertyTypes, zod's `.optional()` infers `key?: T | undefined`, which
  // CreatePaymentBody does not accept; absent keys are dropped instead of set to undefined.
  .transform(
    ({
      issuer_id,
      token,
      installments,
      statement_descriptor,
      notification_url,
      date_of_expiration,
      ...required
    }) => ({
      ...required,
      ...(issuer_id == null ? {} : { issuer_id }),
      ...(token == null ? {} : { token }),
      ...(installments == null ? {} : { installments }),
      ...(statement_descriptor == null ? {} : { statement_descriptor }),
      ...(notification_url == null ? {} : { notification_url }),
      ...(date_of_expiration == null ? {} : { date_of_expiration }),
    }),
  );

/** Recovers uncertain writes by reference before replaying the exact persisted operation. */
export async function resumePayment(
  service: NelcotaClient<Database>,
  accessToken: string,
  request: Awaited<ReturnType<typeof readRequest>>,
) {
  if (request.provider_payment_id != null)
    return await getPayment(accessToken, request.provider_payment_id);
  if (request.status !== "pending") throw new PaymentAttemptClosedError();
  const existing =
    request.payment_prepared_at == null
      ? null
      : await findPaymentByReference(accessToken, request.id);
  if (existing != null) return existing;
  const payload = await claimPayment(service, request.id);
  if (payload == null) return null;
  try {
    return await createPayment(accessToken, storedPaymentBodySchema.parse(payload), request.id);
  } catch (error) {
    await releasePayment(service, request.id, isDefinitivePaymentFailure(error));
    throw error;
  }
}
