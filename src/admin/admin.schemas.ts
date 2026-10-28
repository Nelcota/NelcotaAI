import { z } from "zod";

import { bigintSchema } from "@/shared/database-values";
import { parseBrlToCents } from "@/shared/money";
import { taxDocumentSchema } from "@/shared/tax-document";

// Same limits as the database CHECK constraints and functions (migrations V1, V4 and V6).
const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 500;
const MAX_PIX_KEY_LENGTH = 140;
// BR Code merchant city (field 60).
const MAX_PIX_CITY_LENGTH = 15;
const MAX_EMAIL_LENGTH = 254;
// R$ 1.000.000,00, the limit of admin_adjust_balance.
const MAX_ADJUSTMENT_CENTS = 100_000_000;

const requiredText = (maxLength: number, emptyMessage: string) =>
  z
    .string()
    .trim()
    .normalize("NFC")
    .min(1, emptyMessage)
    .max(maxLength, `Use no máximo ${maxLength} caracteres.`);

const amountInCents = (emptyMessage: string) =>
  z
    .string()
    .trim()
    .min(1, emptyMessage)
    .transform((text, context) => {
      const cents = parseBrlToCents(text);
      if (cents == null || cents === 0) {
        context.addIssue({ code: "custom", message: "Informe um valor como 150 ou 1.234,56." });
        return z.NEVER;
      }
      return cents;
    });

/** New organization: CPF/CNPJ may be typed with punctuation; only digits are kept. */
export const organizationFormSchema = z.object({
  name: requiredText(MAX_NAME_LENGTH, "Informe o nome da empresa."),
  document: taxDocumentSchema,
});

/** Linking a login created in the Nelcota panel to an organization. */
export const linkUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Informe o e-mail da conta.")
    .max(MAX_EMAIL_LENGTH, "O e-mail é longo demais.")
    .pipe(z.email("Informe um e-mail válido.")),
  name: requiredText(MAX_NAME_LENGTH, "Informe o nome da pessoa."),
});

/** Manual balance adjustment: a positive amount plus a direction, and a mandatory reason. */
export const adjustBalanceSchema = z.object({
  direction: z.enum(["add", "remove"]),
  amount: amountInCents("Informe o valor do ajuste.").refine(
    (cents) => cents <= MAX_ADJUSTMENT_CENTS,
    { message: "O ajuste máximo é de R$ 1.000.000,00." },
  ),
  description: requiredText(MAX_TEXT_LENGTH, "Descreva o motivo do ajuste."),
});

/** Reason shown to the customer when a top-up request is refused. */
export const cancelTopupSchema = z.object({
  reason: requiredText(MAX_TEXT_LENGTH, "Informe o motivo da recusa."),
});

/** Pix receiving data and accepted top-up range. */
export const settingsFormSchema = z
  .object({
    pixKey: requiredText(MAX_PIX_KEY_LENGTH, "Informe a chave Pix."),
    pixReceiverName: requiredText(MAX_NAME_LENGTH, "Informe o nome do favorecido."),
    pixCity: requiredText(MAX_PIX_CITY_LENGTH, "Informe a cidade do favorecido."),
    minimum: amountInCents("Informe o valor mínimo."),
    maximum: amountInCents("Informe o valor máximo."),
  })
  .refine((value) => value.maximum >= value.minimum, {
    message: "O máximo deve ser maior ou igual ao mínimo.",
    path: ["maximum"],
  });

/** A row of `organizations`, as the admin lists and edits it. */
const organizationRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  document: z.string(),
  status: z.enum(["active", "blocked"]),
  created_at: z.string(),
});

/** A row of `organization_balances`. */
const balanceRowSchema = z.object({
  organization_id: z.string(),
  balance_cents: bigintSchema,
  month_topup_cents: bigintSchema,
});

/** A row of `organization_summaries`: the organization joined with its balance. */
export const organizationSummarySchema = organizationRowSchema.extend({
  balance_cents: balanceRowSchema.shape.balance_cents,
  month_topup_cents: balanceRowSchema.shape.month_topup_cents,
});

/** A person linked to an organization. */
export const memberRowSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  role: z.enum(["owner", "member"]),
  created_at: z.string(),
});

/** A pending request with its organization's name, for the admin queue. */
export const pendingRequestSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  amount_cents: bigintSchema,
  receipt_path: z.string().nullable(),
  created_at: z.string(),
  organization: z.object({ name: z.string() }).nullable(),
});

/** A request in the admin history, with its organization's name. */
export const requestHistoryRowSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  amount_cents: bigintSchema,
  status: z.enum(["pending", "confirmed", "cancelled", "withdrawn"]),
  cancel_reason: z.string().nullable(),
  payment_reference: z.string().nullable(),
  receipt_path: z.string().nullable(),
  created_at: z.string(),
  payment_method: z.enum(["manual_pix", "pix", "card"]),
  provider_payment_id: z.string().nullable(),
  provider_status: z.string().nullable(),
  organization: z.object({ name: z.string() }).nullable(),
});

/** A ledger entry. */
export const ledgerEntrySchema = z.object({
  id: z.string(),
  type: z.enum(["topup", "usage", "refund", "adjustment"]),
  amount_cents: bigintSchema,
  description: z.string(),
  created_at: z.string(),
});

/** Full-platform financial indicators from a dedicated database aggregate. */
export const platformSummarySchema = z.object({
  organization_count: bigintSchema,
  active_organization_count: bigintSchema,
  month_topup_cents: bigintSchema,
  pending_count: bigintSchema,
  pending_cents: bigintSchema,
});
