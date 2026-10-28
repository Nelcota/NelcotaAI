import { MercadoPagoConfig, MercadoPagoError, MPConnectionError, Payment } from "mercadopago";
import { z } from "zod";

import { MercadoPagoApiError } from "./payments.errors";

const REQUEST_TIMEOUT_IN_MS = 15_000;
const MAX_ERROR_DETAIL_LENGTH = 300;
// Same limit as topup_requests.provider_status (migration V10).
const MAX_STATUS_LENGTH = 40;
const HTTP_OK = 200;

const paymentSchema = z.object({
  id: z.number().int().positive(),
  status: z.string().min(1).max(MAX_STATUS_LENGTH),
  status_detail: z.string().nullish(),
  transaction_amount: z.number().nonnegative(),
  external_reference: z.string().nullish(),
  date_last_updated: z.iso.datetime({ offset: true }).nullish(),
  date_of_expiration: z.iso.datetime({ offset: true }).nullish(),
  point_of_interaction: z
    .object({
      transaction_data: z.object({ qr_code: z.string().nullish() }).nullish(),
    })
    .nullish(),
});

export type MercadoPagoPayment = z.output<typeof paymentSchema>;

/** A Mercado Pago payment id as it travels in URLs and webhooks: up to 30 digits. */
export const paymentIdSchema = z.string().regex(/^\d{1,30}$/);

type SdkPaymentBody = Parameters<Payment["create"]>[0]["body"];

/** SDK payment fields, with the fields required by this app made mandatory. */
export type CreatePaymentBody = Omit<SdkPaymentBody, "issuer_id" | "payer"> & {
  readonly transaction_amount: number;
  readonly description: string;
  readonly payment_method_id: string;
  readonly external_reference: string;
  readonly payer: {
    readonly email: string;
    readonly identification: { readonly type: "CPF" | "CNPJ"; readonly number: string };
  };
  readonly issuer_id?: string;
};

function paymentClient(accessToken: string): Payment {
  return new Payment(
    new MercadoPagoConfig({
      accessToken,
      // Preserve the existing single attempt; the webhook reconciles uncertain outcomes.
      options: { timeout: REQUEST_TIMEOUT_IN_MS, maxRetries: 0 },
    }),
  );
}

/** Creates a payment using the request id as the idempotency key. */
export async function createPayment(
  accessToken: string,
  body: CreatePaymentBody,
  idempotencyKey: string,
): Promise<MercadoPagoPayment> {
  const { issuer_id: issuerId, ...fields } = body;
  return await readPayment(
    paymentClient(accessToken).create({
      body: {
        ...fields,
        ...(issuerId == null
          ? {}
          : { issuer_id: z.coerce.number().int().positive().parse(issuerId) }),
      },
      requestOptions: { idempotencyKey },
    }),
    "create payment",
  );
}

/** Reads the authoritative payment status from Mercado Pago. */
export async function getPayment(
  accessToken: string,
  paymentId: string,
): Promise<MercadoPagoPayment> {
  const id = paymentIdSchema.parse(paymentId);
  return await readPayment(paymentClient(accessToken).get({ id }), "get payment");
}

/** Finds an uncertain creation by its immutable external reference, then reads full details. */
export async function findPaymentByReference(
  accessToken: string,
  requestId: string,
): Promise<MercadoPagoPayment | null> {
  const reference = z.uuid().parse(requestId);
  const response = await paymentClient(accessToken).search({
    options: {
      external_reference: reference,
      sort: "date_created",
      criteria: "desc",
      limit: 2,
    },
  });
  // Two payments with the same reference would be an integrity problem: `limit: 2` plus
  // `.max(1)` turns it into a parse failure (reported as a gateway error) instead of picking one.
  const parsed = z
    .object({
      results: z
        .array(
          z.object({
            id: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform(String),
            external_reference: z.string(),
          }),
        )
        .max(1),
    })
    .parse(response);
  const match = parsed.results[0];
  if (match == null) return null;
  if (match.external_reference !== reference)
    throw new MercadoPagoApiError("search payment", HTTP_OK, "external reference mismatch");
  return await getPayment(accessToken, match.id);
}

async function readPayment(
  result: Promise<unknown>,
  operation: string,
): Promise<MercadoPagoPayment> {
  let response: unknown;
  try {
    response = await result;
  } catch (error) {
    // A timeout can still mean a successful charge: never turn it into a definite refusal.
    if (error instanceof MPConnectionError) {
      throw error;
    }
    if (error instanceof MercadoPagoError) {
      const detail = error.message.replaceAll(/\s+/g, " ").slice(0, MAX_ERROR_DETAIL_LENGTH);
      throw new MercadoPagoApiError(operation, error.status, detail);
    }
    throw error;
  }
  const parsed = paymentSchema.safeParse(response);
  if (parsed.success === false) {
    throw new MercadoPagoApiError(operation, HTTP_OK, "unexpected response body");
  }
  return parsed.data;
}
