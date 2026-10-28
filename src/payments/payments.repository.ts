import { createClient, type NelcotaClient } from "@nelcota/client";
import { z } from "zod";

import type { Database } from "@/shared/database";

import { fromMercadoPagoAmount, pixCodeOf, pixExpiresAt } from "./mercado-pago-values";
import type { CreatePaymentBody, MercadoPagoPayment } from "./mercado-pago.api";
import type { readPaymentsEnv } from "./payments.env";
import { PayerNotFoundError, TopupRequestNotFoundError } from "./payments.errors";

type Client = NelcotaClient<Database>;
const statusSchema = z.enum(["pending", "confirmed", "cancelled", "withdrawn"]);

/** Opens a server-scoped client whose session cannot leak into another request. */
export function connectPaymentsClient(
  env: ReturnType<typeof readPaymentsEnv>,
  accessToken: string,
) {
  const client = createClient<Database>(env.VITE_NELCOTA_URL, {
    accessToken: () => accessToken,
    auth: { autoRefresh: false },
  });
  return { client, [Symbol.dispose]: () => client.dispose() };
}

export async function readPayer(user: Client) {
  const { data: account, error: accountError } = await user.auth.getUser();
  if (accountError != null) throw accountError;
  const { data: profile, error } = await user
    .from("profiles")
    .select("organization:organizations(document)")
    .eq("user_id", account.id)
    .maybeSingle();
  if (error != null) throw error;
  const document = profile?.organization?.document;
  if (document == null) throw new PayerNotFoundError();
  return { email: account.email, document };
}

export async function startRequest(
  user: Client,
  amountInCents: number,
  method: "pix" | "card",
  attemptId: string,
) {
  const { data, error } = await user.rpc("start_online_topup", {
    p_amount_cents: amountInCents,
    p_payment_method: method,
    p_attempt_id: attemptId,
  });
  if (error != null) throw error;
  return data;
}

/** Reads through the caller's RLS context before the service account may reconcile a payment. */
export async function readRequest(user: Client, requestId: string) {
  const { data, error } = await user
    .from("topup_requests")
    .select(
      "id,status,payment_method,provider_payment_id,payment_prepared_at,created_at,duplicate_of_request_id",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error != null) throw error;
  if (data == null) throw new TopupRequestNotFoundError(requestId);
  return data;
}

export async function preparePayment(service: Client, requestId: string, body: CreatePaymentBody) {
  const { error } = await service.rpc("prepare_online_payment", {
    p_request_id: requestId,
    p_payload: body,
  });
  if (error != null) throw error;
}

export async function claimPayment(service: Client, requestId: string) {
  const { data, error } = await service.rpc("claim_online_payment", { p_request_id: requestId });
  if (error != null) throw error;
  return data;
}

export async function releasePayment(
  service: Client,
  requestId: string,
  definitiveFailure = false,
) {
  const { error } = await service.rpc("release_online_payment", {
    p_request_id: requestId,
    p_definitive_failure: definitiveFailure,
  });
  if (error != null) throw error;
}

/** Persists the provider observation, with its version and any recoverable Pix details. */
export async function applyPaymentStatus(
  service: Client,
  requestId: string,
  payment: MercadoPagoPayment,
  createdAt?: string,
) {
  const qrCode = pixCodeOf(payment);
  if (qrCode != null) {
    const originalCreatedAt = createdAt ?? (await readRequest(service, requestId)).created_at;
    const { error } = await service.rpc("record_mercado_pago_payment", {
      p_request_id: requestId,
      p_provider_payment_id: String(payment.id),
      p_pix_qr_code: qrCode,
      p_pix_expires_at: pixExpiresAt(payment, originalCreatedAt),
    });
    if (error != null) throw error;
  }
  const { data, error } = await service.rpc("apply_mercado_pago_status", {
    p_request_id: requestId,
    p_provider_payment_id: String(payment.id),
    p_provider_status: payment.status,
    p_amount_cents: fromMercadoPagoAmount(payment.transaction_amount),
    ...(payment.date_last_updated == null
      ? {}
      : { p_provider_updated_at: payment.date_last_updated }),
  });
  if (error != null) throw error;
  return statusSchema.parse(data);
}
