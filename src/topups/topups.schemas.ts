import { z } from "zod";

import type { Database } from "@/shared/database";
import { bigintSchema } from "@/shared/database-values";
import { formatCents } from "@/shared/format";
import { parseBrlToCents } from "@/shared/money";

/** How a top-up request is paid, as stored in `topup_requests.payment_method`. */
export type TopupPaymentMethod = Database["public"]["Enums"]["topup_payment_method"];

const TOPUP_PAYMENT_METHODS = [
  "manual_pix",
  "pix",
  "card",
] as const satisfies readonly TopupPaymentMethod[];
/** A Postgres `date` as `YYYY-MM-DD`. */
const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A row of `topup_requests` as the screens read it. */
export const topupRequestSchema = z.object({
  id: z.string(),
  amount_cents: bigintSchema,
  status: z.enum(["pending", "confirmed", "cancelled", "withdrawn"]),
  cancel_reason: z.string().nullable(),
  receipt_path: z.string().nullable(),
  created_at: z.string(),
  decided_at: z.string().nullable(),
  payment_method: z.enum(TOPUP_PAYMENT_METHODS),
  /** Pix "copia e cola" of a Mercado Pago Pix, and its deadline. */
  pix_qr_code: z.string().nullable(),
  pix_expires_at: z.string().nullable(),
});

/** The caller's row in `organization_balances`. */
const organizationBalanceSchema = z.object({
  balance_cents: bigintSchema,
  month_topup_cents: bigintSchema,
});

/** Financial facts computed from the complete ledger, independent of request-list pagination. */
export const organizationSummarySchema = organizationBalanceSchema.extend({
  credited_count: bigintSchema,
  last_credit_cents: bigintSchema.nullable(),
  last_credit_at: z.string().nullable(),
});

/** One row of `get_monthly_topups`. */
export const monthlyTopupSchema = z.object({
  month: calendarDateSchema,
  topup_cents: bigintSchema,
});

/** What the customer needs to pay: Pix data and the accepted range, from `settings`. */
export const pixSettingsSchema = z.object({
  pix_key: z.string().nullable(),
  pix_receiver_name: z.string().nullable(),
  pix_city: z.string().nullable(),
  minimum_topup_cents: bigintSchema,
  maximum_topup_cents: bigintSchema,
});

/**
 * Builds the schema of the top-up amount form for the configured range.
 *
 * @param minimumInCents - Smallest accepted amount, in cents.
 * @param maximumInCents - Largest accepted amount, in cents.
 * @returns A schema that turns the typed amount (`1.234,56`) into cents.
 */
export function createTopupAmountSchema(minimumInCents: number, maximumInCents: number) {
  return z.object({
    amount: z
      .string()
      .trim()
      .min(1, "Informe o valor da recarga.")
      .transform((text, context) => {
        const cents = parseBrlToCents(text);
        if (cents == null) {
          context.addIssue({ code: "custom", message: "Informe um valor como 150 ou 1.234,56." });
          return z.NEVER;
        }
        return cents;
      })
      .refine((cents) => cents >= minimumInCents, {
        message: `O valor mínimo é ${formatCents(minimumInCents)}.`,
      })
      .refine((cents) => cents <= maximumInCents, {
        message: `O valor máximo é ${formatCents(maximumInCents)}.`,
      }),
  });
}
