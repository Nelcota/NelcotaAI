import { afterAll, afterEach, beforeAll, expect, mock, setSystemTime, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";

import { payTopupWithCard, refreshTopupPayment, startPixTopup } from "./payments.service";
import { handleMercadoPagoWebhook } from "./payments.webhook";

afterEach(() => mock.restore());

const ENV_KEYS = [
  "VITE_NELCOTA_URL",
  "NELCOTA_SERVICE_ROLE_TOKEN",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "APP_URL",
] as const;
const savedEnv = ENV_KEYS.map((key) => ({ key, value: process.env[key] }));
beforeAll(() => {
  process.env["VITE_NELCOTA_URL"] = "https://nelcota.example.com";
  process.env["NELCOTA_SERVICE_ROLE_TOKEN"] = "test-service-token";
  process.env["MERCADO_PAGO_ACCESS_TOKEN"] = "test-payment-token";
  process.env["MERCADO_PAGO_WEBHOOK_SECRET"] = "test-webhook-secret";
  process.env["APP_URL"] = "http://127.0.0.1:3000";
  setSystemTime(new Date("2026-10-28T12:00:00Z"));
});
afterAll(() => {
  setSystemTime();
  for (const { key, value } of savedEnv) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

function paymentNetwork(
  providerStatus: string,
  qrCode?: string,
  scenario: {
    duplicate?: boolean;
    resolved?: boolean;
    knownPayment?: boolean;
    recoverable?: boolean;
  } = {},
) {
  const requestId = "00000000-0000-4000-8000-000000000001";
  let preparedPayload: unknown = null;
  let recordedStatus = scenario.resolved === true ? "cancelled" : "pending";
  let duplicateOf = scenario.resolved === true ? "00000000-0000-4000-8000-000000000002" : null;
  const calls: string[] = [];
  const implementation = Object.assign(
    async (input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
      const request = new Request(input, options);
      const url = new URL(request.url);
      calls.push(url.pathname);
      const body: unknown = request.body == null ? null : await request.json();
      if (url.pathname === "/auth/v1/user")
        return Response.json({
          id: requestId,
          email: "payer@example.com",
          created_at: "2026-10-01T12:00:00Z",
          email_confirmed_at: "2026-10-01T12:00:00Z",
          last_sign_in_at: null,
          user_metadata: {},
        });
      if (url.pathname === "/rest/v1/profiles")
        return Response.json([{ organization: { document: "52998224725" } }]);
      if (url.pathname.endsWith("start_online_topup")) return Response.json(requestId);
      if (url.pathname === "/rest/v1/topup_requests")
        return Response.json([
          {
            id: requestId,
            status: recordedStatus,
            payment_method: "pix",
            provider_payment_id:
              scenario.knownPayment === true || scenario.resolved === true ? "123" : null,
            duplicate_of_request_id: duplicateOf,
            payment_prepared_at: scenario.recoverable === true ? "2026-10-28T12:00:00Z" : null,
            created_at: "2026-10-28T12:00:00Z",
          },
        ]);
      if (url.pathname.endsWith("prepare_online_payment")) {
        if (body == null || typeof body !== "object" || "p_payload" in body === false)
          throw new Error("payload missing");
        preparedPayload = body.p_payload;
        return Response.json(null);
      }
      if (url.pathname.endsWith("record_mercado_pago_payment")) return Response.json(null);
      if (url.pathname.endsWith("claim_online_payment")) return Response.json(preparedPayload);
      if (url.hostname === "api.mercadopago.com" && url.pathname === "/v1/payments/search")
        return Response.json({ results: [{ id: 123, external_reference: requestId }] });
      if (
        url.hostname === "api.mercadopago.com" &&
        (url.pathname === "/v1/payments" || url.pathname === "/v1/payments/123")
      )
        return Response.json({
          id: 123,
          status: providerStatus,
          ...(qrCode == null
            ? {}
            : { point_of_interaction: { transaction_data: { qr_code: qrCode } } }),
          transaction_amount: 50,
          external_reference: requestId,
        });
      if (url.pathname.endsWith("apply_mercado_pago_status")) {
        recordedStatus = providerStatus === "approved" ? "confirmed" : "cancelled";
        if (providerStatus === "pending") recordedStatus = "pending";
        if (scenario.duplicate === true) {
          recordedStatus = "cancelled";
          duplicateOf = "00000000-0000-4000-8000-000000000002";
        }
        return Response.json(recordedStatus);
      }
      throw new Error(`unexpected fixture request ${url.pathname}`);
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  spyOn(globalThis, "fetch").mockImplementation(implementation);

  return { requestId, calls, readStatus: () => recordedStatus };
}

const INPUT = {
  accessToken: "test-user-token",
  amountInCents: 5000,
  attemptId: "00000000-0000-4000-8000-000000000001",
};

const CARD = {
  token: "test-card-token",
  installments: 1,
  paymentMethodId: "visa",
  issuerId: null,
  cardholderDocument: "52998224725",
};

test("reports duplicate card creation only after persisting its terminal result", async () => {
  const network = paymentNetwork("approved", undefined, { duplicate: true });

  const result = await payTopupWithCard({ ...INPUT, card: CARD });

  expect(result).toEqual({ ok: false, reason: "duplicate_payment" });
  expect(network.readStatus()).toBe("cancelled");
  expect(network.calls.filter((path) => path === "/rest/v1/topup_requests")).toHaveLength(2);
});

test("does not offer an approved duplicate Pix for payment again", async () => {
  paymentNetwork("approved", "already-paid-qr", { duplicate: true });

  const result = await startPixTopup(INPUT);

  expect(result).toEqual({ ok: false, reason: "duplicate_payment" });
});

test("reconciliation returns the terminal duplicate after a committed provider observation", async () => {
  const network = paymentNetwork("approved", undefined, { duplicate: true, knownPayment: true });

  const result = await refreshTopupPayment({
    accessToken: INPUT.accessToken,
    requestId: INPUT.attemptId,
  });

  expect(result).toEqual({ ok: false, reason: "duplicate_payment" });
  expect(network.readStatus()).toBe("cancelled");
});

test("does not retry provider calls for an already resolved duplicate", async () => {
  const network = paymentNetwork("approved", undefined, { resolved: true });

  const result = await refreshTopupPayment({
    accessToken: INPUT.accessToken,
    requestId: INPUT.attemptId,
  });
  const retry = await payTopupWithCard({ ...INPUT, card: CARD });

  expect(result).toEqual({ ok: false, reason: "duplicate_payment" });
  expect(retry).toEqual({ ok: false, reason: "duplicate_payment" });
  expect(network.calls.some((path) => path.startsWith("/v1/payments"))).toBe(false);
  expect(network.calls.some((path) => path.endsWith("prepare_online_payment"))).toBe(false);
});

test("recovers a formerly blocked duplicate by searching its original reference", async () => {
  const network = paymentNetwork("approved", undefined, { duplicate: true, recoverable: true });

  const result = await refreshTopupPayment({
    accessToken: INPUT.accessToken,
    requestId: INPUT.attemptId,
  });

  expect(result).toEqual({ ok: false, reason: "duplicate_payment" });
  expect(network.readStatus()).toBe("cancelled");
  expect(network.calls).toContain("/v1/payments/search");
  expect(network.calls).toContain("/v1/payments/123");
  expect(network.calls).not.toContain("/v1/payments");
});

test("acknowledges a webhook that closes a duplicate instead of asking the provider to retry", async () => {
  const network = paymentNetwork("approved", undefined, { duplicate: true });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const requestId = "test-webhook-request";
  const signature = createHmac("sha256", "test-webhook-secret")
    .update(`id:123;request-id:${requestId};ts:${timestamp};`)
    .digest("hex");

  const response = await handleMercadoPagoWebhook(
    new Request("https://app.example.com/api/mercado-pago/webhook?type=payment&data.id=123", {
      headers: { "x-request-id": requestId, "x-signature": `ts=${timestamp},v1=${signature}` },
    }),
  );

  expect(response.status).toBe(200);
  expect(network.readStatus()).toBe("cancelled");
});

test.each(["rejected", "cancelled", "refunded", "charged_back"])(
  "returns a closed attempt for %s Pix without a QR code",
  async (status) => {
    const network = paymentNetwork(status);

    const result = await startPixTopup(INPUT);

    expect(network.readStatus()).toBe("cancelled");
    expect(result).toEqual({ ok: false, reason: "attempt_closed" });
    expect(network.calls).toContain("/rest/v1/rpc/apply_mercado_pago_status");
  },
);

test("does not offer a QR code from a rejected payment", async () => {
  paymentNetwork("rejected", "unpayable-qr");

  const result = await startPixTopup(INPUT);

  expect(result).toEqual({ ok: false, reason: "attempt_closed" });
});

test("returns an approval without requiring another QR code", async () => {
  const network = paymentNetwork("approved");

  const result = await startPixTopup(INPUT);

  expect(result).toEqual({ ok: true, requestId: network.requestId, status: "confirmed" });
});

test("returns a payable pending Pix with its original deadline", async () => {
  const network = paymentNetwork("pending", "payable-qr");

  const result = await startPixTopup(INPUT);

  expect(result).toEqual({
    ok: true,
    requestId: network.requestId,
    status: "pending",
    qrCode: "payable-qr",
    expiresAt: "2026-10-28T12:30:00.000Z",
  });
});

test("keeps a pending creation without a QR code available for reconciliation", async () => {
  const network = paymentNetwork("pending");

  const result = await startPixTopup(INPUT);

  expect(result).toEqual({
    ok: false,
    reason: "payment_in_progress",
    requestId: network.requestId,
  });
});
