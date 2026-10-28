import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { MPConnectionError } from "mercadopago";
import { ZodError } from "zod";

import { createPayment, getPayment, type CreatePaymentBody } from "./mercado-pago.api";
import { MercadoPagoApiError } from "./payments.errors";

const BODY = {
  transaction_amount: 100.5,
  description: "AI credits",
  payment_method_id: "pix",
  external_reference: "request-id",
  payer: { email: "payer@example.com", identification: { type: "CPF", number: "52998224725" } },
} satisfies CreatePaymentBody;
const PAYMENT = { id: 123, status: "pending", transaction_amount: 100.5 };

afterEach(() => mock.restore());

describe("Mercado Pago SDK adapter", () => {
  test("creates a payment with the original idempotency key and authorization", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(PAYMENT));

    const payment = await createPayment("test-access-token", BODY, "request-id");

    const [url, options] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(options?.headers);
    expect(url).toBe("https://api.mercadopago.com/v1/payments");
    expect(options?.method).toBe("POST");
    expect(options?.body).toBe(JSON.stringify(BODY));
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(headers.get("authorization")).toBe("Bearer test-access-token");
    expect(headers.get("x-idempotency-key")).toBe("request-id");
    expect(payment).toEqual(PAYMENT);
  });

  test("converts the card issuer to the numeric field required by the SDK", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(PAYMENT));

    await createPayment("test-access-token", { ...BODY, issuer_id: "25" }, "request-id");

    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ ...BODY, issuer_id: 25 }));
  });

  test("reads the authoritative payment through the SDK", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(PAYMENT));

    const payment = await getPayment("test-access-token", "123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.mercadopago.com/v1/payments/123");
    expect(payment.status).toBe("pending");
  });

  test("rejects an invalid payment id before making a request", async () => {
    const fetchMock = spyOn(globalThis, "fetch");

    const result = await getPayment("test-access-token", "../other-endpoint").catch(
      (error: unknown) => error,
    );

    expect(result).toBeInstanceOf(ZodError);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("retains runtime validation for successful SDK responses", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: 123, status: "pending" }));

    const result = await getPayment("test-access-token", "123").catch((error: unknown) => error);

    expect(result).toBeInstanceOf(MercadoPagoApiError);
    expect(result).toMatchObject({ httpStatus: 200 });
  });

  test("rejects malformed JSON in a successful SDK response", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json"));

    const result = await getPayment("test-access-token", "123").catch((error: unknown) => error);

    expect(result).toBeInstanceOf(MercadoPagoApiError);
    expect(result).toHaveProperty("message", expect.stringContaining("unexpected response body"));
  });

  test("maps a definite API refusal to the existing application error", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ message: "invalid\nrequest" }, { status: 400 }),
    );

    const result = await createPayment("test-access-token", BODY, "request-id").catch(
      (error: unknown) => error,
    );

    expect(result).toBeInstanceOf(MercadoPagoApiError);
    expect(result).toMatchObject({ httpStatus: 400 });
    expect(result).toHaveProperty("message", expect.stringContaining("invalid request"));
  });

  test("keeps network failures distinct from a definite payment refusal", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("connection lost"),
    );

    const result = await createPayment("test-access-token", BODY, "request-id").catch(
      (error: unknown) => error,
    );

    expect(result).toBeInstanceOf(MPConnectionError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("does not add automatic retries after a server error", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ message: "unavailable" }, { status: 503 }),
    );

    const result = await createPayment("test-access-token", BODY, "request-id").catch(
      (error: unknown) => error,
    );

    expect(result).toBeInstanceOf(MercadoPagoApiError);
    expect(result).toMatchObject({ httpStatus: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
