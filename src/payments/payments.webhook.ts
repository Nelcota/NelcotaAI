import { z } from "zod";

import { getPayment, paymentIdSchema } from "./mercado-pago.api";
import { readPaymentsEnv } from "./payments.env";
import { connectPaymentsClient, applyPaymentStatus } from "./payments.repository";
import { isValidWebhookSignature } from "./webhook-signature";

const requestIdSchema = z.uuid();

/**
 * Handles a Mercado Pago webhook call: checks the signature, reads the payment from the API
 * and applies its status to the request in `external_reference`.
 *
 * @param request - The incoming HTTP request.
 * @returns 200 when handled or ignored, 401 for a bad signature, 500 to make Mercado Pago retry.
 */
export async function handleMercadoPagoWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id");
  const type = url.searchParams.get("type");
  let env: ReturnType<typeof readPaymentsEnv>;
  try {
    env = readPaymentsEnv();
  } catch (error) {
    console.error("payments: webhook received but payments are not configured", error);
    return new Response(null, { status: 503 });
  }
  const notification = {
    signatureHeader: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
  };
  if (
    isValidWebhookSignature(notification, env.MERCADO_PAGO_WEBHOOK_SECRET, new Date()) === false
  ) {
    return new Response(null, { status: 401 });
  }
  const paymentId = paymentIdSchema.safeParse(dataId);
  if (type !== "payment" || paymentId.success === false) {
    return new Response(null, { status: 200 });
  }
  try {
    const payment = await getPayment(env.MERCADO_PAGO_ACCESS_TOKEN, paymentId.data);
    const requestId = requestIdSchema.safeParse(payment.external_reference);
    if (requestId.success === false) {
      // Payments created outside this app (for example, in the Mercado Pago panel).
      return new Response(null, { status: 200 });
    }
    using service = connectPaymentsClient(env, env.NELCOTA_SERVICE_ROLE_TOKEN);
    await applyPaymentStatus(service.client, requestId.data, payment);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(`payments: webhook for payment ${dataId} failed`, error);
    return new Response(null, { status: 500 });
  }
}
