import { afterAll, afterEach, beforeAll, expect, mock, setSystemTime, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";

import { handleMercadoPagoWebhook } from "./payments.webhook";

afterEach(() => mock.restore());

const ENV_KEYS = [
  "VITE_NELCOTA_URL",
  "NELCOTA_SERVICE_ROLE_TOKEN",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "APP_URL",
] as const;
const WEBHOOK_SECRET = "test-webhook-secret";
const savedEnv = ENV_KEYS.map((key) => ({ key, value: process.env[key] }));
beforeAll(() => {
  process.env["VITE_NELCOTA_URL"] = "https://nelcota.example.com";
  process.env["NELCOTA_SERVICE_ROLE_TOKEN"] = "test-service-token";
  process.env["MERCADO_PAGO_ACCESS_TOKEN"] = "test-payment-token";
  process.env["MERCADO_PAGO_WEBHOOK_SECRET"] = WEBHOOK_SECRET;
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

/** Builds a webhook request signed the way Mercado Pago signs it, for the given query string. */
function signedRequest(query: string, dataId: string | null, secret = WEBHOOK_SECRET): Request {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const requestId = "test-webhook-request";
  const manifest = `${dataId == null ? "" : `id:${dataId};`}request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");
  return new Request(`https://app.example.com/api/mercado-pago/webhook?${query}`, {
    headers: { "x-request-id": requestId, "x-signature": `ts=${timestamp},v1=${signature}` },
  });
}

/** Answers Mercado Pago and database calls; `payment` is what GET /v1/payments/:id returns. */
function network(payment: Record<string, unknown> | Error) {
  const calls: string[] = [];
  const implementation = Object.assign(
    (input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
      const url = new URL(new Request(input, options).url);
      calls.push(url.pathname);
      if (url.hostname === "api.mercadopago.com") {
        if (payment instanceof Error) return Promise.reject(payment);
        return Promise.resolve(Response.json(payment));
      }
      if (url.pathname.endsWith("apply_mercado_pago_status")) {
        return Promise.resolve(Response.json("confirmed"));
      }
      return Promise.reject(new Error(`unexpected fixture request ${url.pathname}`));
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  spyOn(globalThis, "fetch").mockImplementation(implementation);
  return { calls };
}

test("rejects a notification signed with another secret", async () => {
  const { calls } = network({});

  const response = await handleMercadoPagoWebhook(
    signedRequest("type=payment&data.id=123", "123", "another-secret"),
  );

  expect(response.status).toBe(401);
  expect(calls).toHaveLength(0);
});

test("rejects a notification without a signature header", async () => {
  const { calls } = network({});

  const response = await handleMercadoPagoWebhook(
    new Request("https://app.example.com/api/mercado-pago/webhook?type=payment&data.id=123"),
  );

  expect(response.status).toBe(401);
  expect(calls).toHaveLength(0);
});

test("acknowledges and ignores notifications that are not about a payment", async () => {
  const { calls } = network({});

  const response = await handleMercadoPagoWebhook(
    signedRequest("type=merchant_order&data.id=123", "123"),
  );

  expect(response.status).toBe(200);
  expect(calls).toHaveLength(0);
});

test("acknowledges and ignores a payment id that is not digits", async () => {
  const { calls } = network({});

  const response = await handleMercadoPagoWebhook(signedRequest("type=payment&data.id=abc", "abc"));

  expect(response.status).toBe(200);
  expect(calls).toHaveLength(0);
});

test("acknowledges a payment created outside this app without touching the database", async () => {
  const { calls } = network({
    id: 123,
    status: "approved",
    transaction_amount: 50,
    external_reference: "order-from-the-panel",
  });

  const response = await handleMercadoPagoWebhook(signedRequest("type=payment&data.id=123", "123"));

  expect(response.status).toBe(200);
  expect(calls).toEqual(["/v1/payments/123"]);
});

test("applies the payment status to the request in the external reference", async () => {
  const { calls } = network({
    id: 123,
    status: "approved",
    transaction_amount: 50,
    external_reference: "00000000-0000-4000-8000-000000000001",
  });

  const response = await handleMercadoPagoWebhook(signedRequest("type=payment&data.id=123", "123"));

  expect(response.status).toBe(200);
  expect(calls).toEqual(["/v1/payments/123", "/rest/v1/rpc/apply_mercado_pago_status"]);
});

test("asks Mercado Pago to retry when the payment cannot be read", async () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
  network(new Error("connection reset"));

  const response = await handleMercadoPagoWebhook(signedRequest("type=payment&data.id=123", "123"));

  expect(response.status).toBe(500);
  expect(errorSpy).toHaveBeenCalled();
});
