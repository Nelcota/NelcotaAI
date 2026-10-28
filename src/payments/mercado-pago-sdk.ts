import { z } from "zod";

import { cardDetailsSchema, type CardDetails } from "./payment-payload";

/** What the card form hands to `onSubmit` (only the fields the app uses). */
const cardFormDataSchema = z.object({
  token: z.string().min(1),
  issuer_id: z.union([z.string(), z.number()]).nullish(),
  payment_method_id: z.string().min(1),
  installments: z.number().int().positive(),
  payer: z.object({
    identification: z.object({ number: z.string() }).nullish(),
  }),
});

/**
 * Turns the card form data into what the server expects. The document typed by the
 * cardholder is reduced to digits and must be a CPF or CNPJ.
 *
 * @param formData - The object the card form passes to `onSubmit`.
 * @returns The card details, or null when the form data is not usable.
 */
export function toCardDetails(formData: unknown): CardDetails | null {
  const parsed = cardFormDataSchema.safeParse(formData);
  if (parsed.success === false) {
    return null;
  }
  const document = (parsed.data.payer.identification?.number ?? "").replaceAll(/\D/g, "");
  const issuerId = parsed.data.issuer_id;
  const card = cardDetailsSchema.safeParse({
    token: parsed.data.token,
    installments: parsed.data.installments,
    paymentMethodId: parsed.data.payment_method_id,
    issuerId: issuerId == null || issuerId === "" ? null : String(issuerId),
    cardholderDocument: document,
  });
  return card.success ? card.data : null;
}
