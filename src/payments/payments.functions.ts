import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";

import { cardDetailsSchema } from "./payment-payload";
import { payTopupWithCard, refreshTopupPayment, startPixTopup } from "./payments.service";
import { handleMercadoPagoWebhook } from "./payments.webhook";

// Limits of what the browser may send. R$ 1.000.000,00 is far above any configured maximum;
// the database still enforces the real range.
const MAX_AMOUNT_IN_CENTS = 100_000_000;
const MAX_ACCESS_TOKEN_LENGTH = 4096;
const accessTokenSchema = z.string().min(1).max(MAX_ACCESS_TOKEN_LENGTH);
const amountSchema = z.number().int().positive().max(MAX_AMOUNT_IN_CENTS);

/** Creates a Pix top-up and returns the code to pay. Runs on the server. */
export const startPixTopupFn = createServerFn({ method: "POST" })
  .validator(
    z.object({ accessToken: accessTokenSchema, amountInCents: amountSchema, attemptId: z.uuid() }),
  )
  .handler(async ({ data }) => await startPixTopup(data));

/** Pays a top-up with a tokenized card. Runs on the server. */
export const payTopupWithCardFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accessToken: accessTokenSchema,
      amountInCents: amountSchema,
      card: cardDetailsSchema,
      attemptId: z.uuid(),
    }),
  )
  .handler(async ({ data }) => await payTopupWithCard(data));

/** Checks the payment of a top-up at Mercado Pago and applies its status. Runs on the server. */
export const refreshTopupPaymentFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: accessTokenSchema, requestId: z.uuid() }))
  .handler(async ({ data }) => await refreshTopupPayment(data));

/**
 * Handles a Mercado Pago webhook request. Server only: the build strips it (and the secrets
 * and crypto it uses) from the browser bundle.
 */
export const handleMercadoPagoWebhookRequest = createServerOnlyFn(
  async (request: Request) => await handleMercadoPagoWebhook(request),
);
