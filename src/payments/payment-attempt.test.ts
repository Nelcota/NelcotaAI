import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { createClient } from "@nelcota/client";

import type { Database } from "@/shared/database";

import { resumePayment } from "./payment-attempt";
import { isDefinitivePaymentFailure, paymentFailureReasonOf } from "./payment-failure";
import { MercadoPagoApiError, PaymentAttemptClosedError } from "./payments.errors";

const REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST = {
  id: REQUEST_ID,
  status: "pending",
  payment_method: "card",
  provider_payment_id: null,
  payment_prepared_at: "2026-10-01T12:00:00Z",
  duplicate_of_request_id: null,
  created_at: "2026-10-01T12:00:00Z",
} as const;
const BODY = {
  transaction_amount: 50,
  description: "Credit top-up",
  payment_method_id: "visa",
  external_reference: REQUEST_ID,
  payer: { email: "payer@example.com", identification: { type: "CPF", number: "52998224725" } },
  token: "test-card-token",
  installments: 1,
};
const PAYMENT = {
  id: 123,
  status: "approved",
  transaction_amount: 50,
  external_reference: REQUEST_ID,
};

function client() {
  return createClient<Database>("https://nelcota.example.com", {
    accessToken: () => "test-service-token",
    auth: { autoRefresh: false },
  });
}

function mockNetwork(respond: (url: string, body: unknown, headers: Headers) => Response) {
  const implementation = Object.assign(
    (input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
      const url = input instanceof Request ? input.url : String(input);
      const body: unknown = typeof options?.body === "string" ? JSON.parse(options.body) : null;
      return Promise.resolve(respond(url, body, new Headers(options?.headers)));
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  return spyOn(globalThis, "fetch").mockImplementation(implementation);
}

afterEach(() => mock.restore());

describe("payment attempt recovery", () => {
  test("replays the exact persisted payload and key after an uncertain 503", async () => {
    const creations: { body: unknown; key: string | null }[] = [];
    const releases: unknown[] = [];
    mockNetwork((url, body, headers) => {
      if (url.includes("/search")) return Response.json({ results: [] });
      if (url.includes("claim_online_payment")) return Response.json(BODY);
      if (url.includes("release_online_payment")) {
        releases.push(body);
        return Response.json(null);
      }
      creations.push({ body: body, key: headers.get("x-idempotency-key") });
      return creations.length === 1
        ? Response.json({ message: "unavailable" }, { status: 503 })
        : Response.json(PAYMENT);
    });
    using service = {
      client: client(),
      [Symbol.dispose]() {
        this.client.dispose();
      },
    };

    const error: unknown = await resumePayment(service.client, "test-mp-token", REQUEST).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(MercadoPagoApiError);
    const recovered = await resumePayment(service.client, "test-mp-token", REQUEST);

    expect(releases).toEqual([{ p_request_id: REQUEST_ID, p_definitive_failure: false }]);
    expect(creations).toEqual([
      { body: BODY, key: REQUEST_ID },
      { body: BODY, key: REQUEST_ID },
    ]);
    expect(recovered?.id).toBe(123);
  });

  test("finds an existing charge by external reference without submitting another payment", async () => {
    const calls: string[] = [];
    mockNetwork((url) => {
      calls.push(url);
      return url.includes("/search")
        ? Response.json({ results: [{ id: "123", external_reference: REQUEST_ID }] })
        : Response.json(PAYMENT);
    });
    const service = client();

    const recovered = await resumePayment(service, "test-mp-token", REQUEST);
    service.dispose();

    expect(recovered?.id).toBe(123);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain(`external_reference=${REQUEST_ID}`);
    expect(calls[1]).toBe("https://api.mercadopago.com/v1/payments/123");
  });

  test.each([200, 408, 409, 429, 500])(
    "retains an uncertain attempt after HTTP %s",
    async (status) => {
      const releases: unknown[] = [];
      mockNetwork((url, body) => {
        if (url.includes("/search")) return Response.json({ results: [] });
        if (url.includes("claim_online_payment")) return Response.json(BODY);
        if (url.includes("release_online_payment")) {
          releases.push(body);
          return Response.json(null);
        }
        return Response.json({ message: "unusable response" }, { status });
      });
      const service = client();

      const error: unknown = await resumePayment(service, "test-mp-token", REQUEST).catch(
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(MercadoPagoApiError);
      service.dispose();

      expect(releases).toEqual([{ p_request_id: REQUEST_ID, p_definitive_failure: false }]);
    },
  );

  test("withdraws an explicit validation refusal", async () => {
    const releases: unknown[] = [];
    mockNetwork((url, body) => {
      if (url.includes("/search")) return Response.json({ results: [] });
      if (url.includes("claim_online_payment")) return Response.json(BODY);
      if (url.includes("release_online_payment")) {
        releases.push(body);
        return Response.json(null);
      }
      return Response.json({ message: "invalid card" }, { status: 400 });
    });
    const service = client();

    const error: unknown = await resumePayment(service, "test-mp-token", REQUEST).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(MercadoPagoApiError);
    service.dispose();

    expect(releases).toEqual([{ p_request_id: REQUEST_ID, p_definitive_failure: true }]);
  });

  test("does not submit while another worker holds the attempt lease", async () => {
    const fetchMock = mockNetwork((url) =>
      url.includes("/search") ? Response.json({ results: [] }) : Response.json(null),
    );
    const service = client();

    const recovered = await resumePayment(service, "test-mp-token", REQUEST);
    service.dispose();

    expect(recovered).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

test("does not treat a definitively closed attempt as an unresolved creation", async () => {
  const fetchMock = spyOn(globalThis, "fetch");
  const service = client();

  const error: unknown = await resumePayment(service, "test-mp-token", {
    ...REQUEST,
    status: "withdrawn",
  }).catch((cause: unknown) => cause);
  service.dispose();

  expect(error).toBeInstanceOf(PaymentAttemptClosedError);
  expect(isDefinitivePaymentFailure(error)).toBe(true);
  expect(paymentFailureReasonOf(error)).toBe("attempt_closed");
  expect(fetchMock).toHaveBeenCalledTimes(0);
});
