import { describe, expect, test } from "bun:test";

import {
  cardDetailsSchema,
  cardPaymentBody,
  notificationUrlFor,
  pixPaymentBody,
} from "./payment-payload";

const REQUEST_ID = "6f1c2c7e-0000-4000-8000-000000000001";
const EXPIRES_AT = new Date("2026-10-27T22:30:00Z");

describe("notificationUrlFor", () => {
  test("points to the webhook route on a public HTTPS app", () => {
    const appUrl = "https://app.nelcota.ai";

    const url = notificationUrlFor(appUrl);

    expect(url).toBe("https://app.nelcota.ai/api/mercado-pago/webhook");
  });

  test("is undefined for plain HTTP", () => {
    const appUrl = "http://app.nelcota.ai";

    const url = notificationUrlFor(appUrl);

    expect(url).toBeUndefined();
  });

  test("is undefined for localhost", () => {
    const appUrl = "https://localhost:3000";

    const url = notificationUrlFor(appUrl);

    expect(url).toBeUndefined();
  });
});

describe("pixPaymentBody", () => {
  test("charges the request amount with a CNPJ payer and the deadline", () => {
    const payer = { email: "ana@padaria.com", document: "11222333000181" };

    const body = pixPaymentBody(REQUEST_ID, 15050, payer, EXPIRES_AT, undefined);

    expect(body).toEqual({
      transaction_amount: 150.5,
      description: "Créditos de IA - Nelcota AI",
      payment_method_id: "pix",
      external_reference: REQUEST_ID,
      payer: {
        email: "ana@padaria.com",
        identification: { type: "CNPJ", number: "11222333000181" },
      },
      date_of_expiration: "2026-10-27T22:30:00.000+00:00",
    });
  });

  test("identifies an 11-digit document as CPF and adds the webhook", () => {
    const payer = { email: "ana@padaria.com", document: "52998224725" };

    const body = pixPaymentBody(REQUEST_ID, 5000, payer, EXPIRES_AT, "https://x.ai/hook");

    expect(body.payer.identification.type).toBe("CPF");
    expect(body.notification_url).toBe("https://x.ai/hook");
  });
});

describe("cardPaymentBody", () => {
  test("uses the request amount, the token and the chosen installments", () => {
    const card = {
      token: "card-token",
      installments: 3,
      paymentMethodId: "visa",
      issuerId: "25",
      cardholderDocument: "52998224725",
    };

    const body = cardPaymentBody(REQUEST_ID, 20000, "ana@padaria.com", card, undefined);

    expect(body).toEqual({
      transaction_amount: 200,
      description: "Créditos de IA - Nelcota AI",
      payment_method_id: "visa",
      external_reference: REQUEST_ID,
      payer: { email: "ana@padaria.com", identification: { type: "CPF", number: "52998224725" } },
      token: "card-token",
      installments: 3,
      statement_descriptor: "NELCOTA AI",
      issuer_id: "25",
    });
  });

  test("leaves the issuer out when the card form sends none", () => {
    const card = {
      token: "card-token",
      installments: 1,
      paymentMethodId: "master",
      issuerId: null,
      cardholderDocument: "52998224725",
    };

    const body = cardPaymentBody(REQUEST_ID, 20000, "ana@padaria.com", card, undefined);

    expect(Object.hasOwn(body, "issuer_id")).toBe(false);
  });
});

describe("card input validation", () => {
  const card = {
    token: "test-token",
    installments: 1,
    paymentMethodId: "visa",
    issuerId: "25",
    cardholderDocument: "52998224725",
  };

  test.each(["invalid", "0", "-1", "1.5", "9007199254740992"])(
    "rejects issuer %s before allocating a request",
    (issuerId) => {
      expect(cardDetailsSchema.safeParse({ ...card, issuerId }).success).toBe(false);
    },
  );

  test("allows a missing issuer", () => {
    expect(cardDetailsSchema.safeParse({ ...card, issuerId: null }).success).toBe(true);
  });

  test("rejects an invalid cardholder document", () => {
    expect(
      cardDetailsSchema.safeParse({ ...card, cardholderDocument: "00000000000" }).success,
    ).toBe(false);
  });
});
