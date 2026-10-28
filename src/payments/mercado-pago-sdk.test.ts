import { describe, expect, test } from "bun:test";

import { toCardDetails } from "./mercado-pago-sdk";

const FORM_DATA = {
  token: "card-token",
  issuer_id: "25",
  payment_method_id: "visa",
  transaction_amount: 100,
  installments: 3,
  payer: { email: "ana@padaria.com", identification: { type: "CPF", number: "529.982.247-25" } },
};

describe("toCardDetails", () => {
  test("keeps the token, installments and the cardholder document digits", () => {
    const formData = FORM_DATA;

    const card = toCardDetails(formData);

    expect(card).toEqual({
      token: "card-token",
      installments: 3,
      paymentMethodId: "visa",
      issuerId: "25",
      cardholderDocument: "52998224725",
    });
  });

  test("accepts a numeric issuer id", () => {
    const formData = { ...FORM_DATA, issuer_id: 25 };

    const card = toCardDetails(formData);

    expect(card?.issuerId).toBe("25");
  });

  test("treats an empty issuer id as missing", () => {
    const formData = { ...FORM_DATA, issuer_id: "" };

    const card = toCardDetails(formData);

    expect(card?.issuerId).toBeNull();
  });

  test("returns null without a token", () => {
    const formData = { ...FORM_DATA, token: "" };

    const card = toCardDetails(formData);

    expect(card).toBeNull();
  });

  test("returns null when the document is not a CPF or CNPJ", () => {
    const formData = { ...FORM_DATA, payer: { identification: { type: "CPF", number: "123" } } };

    const card = toCardDetails(formData);

    expect(card).toBeNull();
  });

  test("returns null for something that is not form data", () => {
    const formData = "not an object";

    const card = toCardDetails(formData);

    expect(card).toBeNull();
  });
});
