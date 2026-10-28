import { z } from "zod";

import { pixCodeOf, pixExpirationFrom, pixExpiresAt } from "./mercado-pago-values";
import { type MercadoPagoPayment } from "./mercado-pago.api";
import { resumePayment, storedPaymentBodySchema } from "./payment-attempt";
import {
  isExpectedFailure,
  isDefinitivePaymentFailure,
  paymentFailureReasonOf,
  type PaymentFailureReason,
} from "./payment-failure";
import {
  cardDetailsSchema,
  cardPaymentBody,
  type CardDetails,
  notificationUrlFor,
  pixPaymentBody,
} from "./payment-payload";
import { readPaymentsEnv } from "./payments.env";
import {
  DuplicatePaymentError,
  PaymentAttemptClosedError,
  PaymentAttemptError,
  PaymentPendingError,
} from "./payments.errors";
import {
  connectPaymentsClient,
  readPayer,
  startRequest,
  readRequest,
  preparePayment,
  applyPaymentStatus,
} from "./payments.repository";

/** Payment failures retain the durable attempt identity so the UI can resume them. */
export type PaymentResult<Success> =
  | ({ readonly ok: true } & Success)
  | { readonly ok: false; readonly reason: PaymentFailureReason; readonly requestId?: string };

async function runPaymentStep<Success>(
  operation: string,
  step: () => Promise<Success>,
): Promise<PaymentResult<Success>> {
  try {
    return { ok: true, ...(await step()) };
  } catch (error) {
    const cause = error instanceof PaymentAttemptError ? error.cause : error;
    const reason = paymentFailureReasonOf(cause);
    if (isExpectedFailure(reason) === false) {
      // SDK errors may contain payment tokens; keep logs free of request/response payloads.
      console.error(`payments: ${operation} failed`, {
        reason,
        error: cause instanceof Error ? cause.name : "UnknownError",
      });
    }
    return {
      ok: false,
      reason,
      ...(error instanceof PaymentAttemptError && isDefinitivePaymentFailure(cause) === false
        ? { requestId: error.requestId }
        : {}),
    };
  }
}

type StartInput = {
  readonly accessToken: string;
  readonly amountInCents: number;
  readonly attemptId: string;
};

async function readOriginalRequest(user: Parameters<typeof readRequest>[0], requestId: string) {
  const request = await readRequest(user, requestId);
  if (request.duplicate_of_request_id != null) throw new DuplicatePaymentError();
  return request;
}

async function startPayment(input: StartInput, card?: CardDetails) {
  // The server functions already validate these; parsing again keeps direct callers (tests,
  // future jobs) under the same contract.
  const attemptId = z.uuid().parse(input.attemptId);
  const validatedCard = card == null ? null : cardDetailsSchema.parse(card);
  const env = readPaymentsEnv();
  using user = connectPaymentsClient(env, input.accessToken);
  using service = connectPaymentsClient(env, env.NELCOTA_SERVICE_ROLE_TOKEN);
  const payer = await readPayer(user.client);
  const method = validatedCard == null ? "pix" : "card";
  const bodyFor = (requestId: string, createdAt: Date) =>
    storedPaymentBodySchema.parse(
      validatedCard == null
        ? pixPaymentBody(
            requestId,
            input.amountInCents,
            payer,
            pixExpirationFrom(createdAt),
            notificationUrlFor(env.APP_URL),
          )
        : cardPaymentBody(
            requestId,
            input.amountInCents,
            payer.email,
            validatedCard,
            notificationUrlFor(env.APP_URL),
          ),
    );
  // Validate all local conversions before allocating a pending request.
  bodyFor(attemptId, new Date());
  const requestId = await startRequest(user.client, input.amountInCents, method, attemptId);
  try {
    const request = await readOriginalRequest(user.client, requestId);
    if (request.payment_prepared_at == null && request.status === "pending") {
      await preparePayment(
        service.client,
        requestId,
        bodyFor(requestId, new Date(request.created_at)),
      );
    }
    const payment = await resumePayment(service.client, env.MERCADO_PAGO_ACCESS_TOKEN, request);
    if (payment == null) throw new PaymentPendingError();
    const status = await applyPaymentStatus(service.client, requestId, payment, request.created_at);
    // Re-read after the committed RPC so duplicate cleanup is never rolled back by the UI error.
    if (status === "cancelled") await readOriginalRequest(user.client, requestId);
    return { requestId, payment, status, createdAt: request.created_at };
  } catch (error) {
    throw new PaymentAttemptError(requestId, error);
  }
}

type PixTopup =
  | { readonly requestId: string; readonly status: "confirmed" }
  | {
      readonly requestId: string;
      readonly status: "pending";
      readonly qrCode: string;
      readonly expiresAt: string;
    };

/** Creates or resumes a Pix checkout, returning terminal decisions before requiring a payment code. */
export async function startPixTopup(input: StartInput): Promise<PaymentResult<PixTopup>> {
  return await runPaymentStep("start Pix top-up", async () => {
    const { requestId, payment, status, createdAt } = await startPayment(input);
    if (status === "confirmed") return { requestId, status };
    if (status !== "pending") throw new PaymentAttemptClosedError();
    const qrCode = pixCodeOf(payment);
    if (qrCode == null) {
      throw new PaymentAttemptError(requestId, new PaymentPendingError());
    }
    return { requestId, qrCode, expiresAt: pixExpiresAt(payment, createdAt), status };
  });
}

/** Creates or resumes a tokenized-card payment without changing the original gateway payload. */
export async function payTopupWithCard(input: StartInput & { readonly card: CardDetails }) {
  return await runPaymentStep("card top-up", async () => {
    const { requestId, payment, status } = await startPayment(input, input.card);
    return { requestId, status, statusDetail: payment.status_detail ?? null };
  });
}

/** Reconciles an authorized request even when the gateway response and payment ID were lost. */
export async function refreshTopupPayment(input: {
  readonly accessToken: string;
  readonly requestId: string;
}) {
  return await runPaymentStep("refresh top-up payment", async () => {
    const env = readPaymentsEnv();
    using user = connectPaymentsClient(env, input.accessToken);
    const request = await readOriginalRequest(user.client, input.requestId);
    if (request.payment_method === "manual_pix") return { status: request.status };
    using service = connectPaymentsClient(env, env.NELCOTA_SERVICE_ROLE_TOKEN);
    const payment: MercadoPagoPayment | null = await resumePayment(
      service.client,
      env.MERCADO_PAGO_ACCESS_TOKEN,
      request,
    );
    if (payment == null) return { status: request.status };
    const status = await applyPaymentStatus(
      service.client,
      request.id,
      payment,
      request.created_at,
    );
    // Re-read after the committed RPC so duplicate cleanup is never rolled back by the UI error.
    if (status === "cancelled") await readOriginalRequest(user.client, request.id);
    return { status };
  });
}
