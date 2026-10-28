import { describe, expect, test } from "bun:test";

import { computeCRC } from "pix-utils/dist/main/crc";

import { buildPixCode, toTransactionId } from "./pix-brcode";
import { InvalidPixPaymentError } from "./topups.errors";

const payment = {
  pixKey: "financeiro@example.com",
  receiverName: "Nelcota AI Ltda",
  receiverCity: "São Paulo",
  amountInCents: 10050,
  transactionId: "PEDIDO123",
};

describe("buildPixCode", () => {
  test("lays out every field in order with its length", () => {
    const code = buildPixCode(payment);

    expect(code.slice(0, -4)).toBe(
      "000201" +
        "26440014br.gov.bcb.pix0122financeiro@example.com" +
        "52040000" +
        "5303986" +
        "5406100.50" +
        "5802BR" +
        "5915NELCOTA AI LTDA" +
        "6009SAO PAULO" +
        "62130509PEDIDO123" +
        "6304",
    );
  });

  test("ends with the CRC of everything before it", () => {
    const code = buildPixCode(payment);

    expect(code.slice(-4)).toBe(computeCRC(code.slice(0, -4)));
  });

  test("removes accents and cuts the name to 25 characters", () => {
    const code = buildPixCode({ ...payment, receiverName: "Associação Brasileira de Padarias" });

    expect(code).toContain("5924ASSOCIACAO BRASILEIRA DE6009");
  });

  test("cuts the city to 15 characters", () => {
    const code = buildPixCode({ ...payment, receiverCity: "Aparecida de Goiânia" });

    expect(code).toContain("6015APARECIDA DE GO");
  });

  test("throws InvalidPixPaymentError for a blank key", () => {
    const act = () => buildPixCode({ ...payment, pixKey: "  " });

    expect(act).toThrow(InvalidPixPaymentError);
  });

  test("throws InvalidPixPaymentError for a zero amount", () => {
    const act = () => buildPixCode({ ...payment, amountInCents: 0 });

    expect(act).toThrow(InvalidPixPaymentError);
  });

  test("throws InvalidPixPaymentError for a fractional amount", () => {
    const act = () => buildPixCode({ ...payment, amountInCents: 10.5 });

    expect(act).toThrow(InvalidPixPaymentError);
  });

  test("throws InvalidPixPaymentError for a transaction id with symbols", () => {
    const act = () => buildPixCode({ ...payment, transactionId: "PEDIDO-1" });

    expect(act).toThrow(InvalidPixPaymentError);
  });

  test("throws InvalidPixPaymentError when the key is longer than the field allows", () => {
    const act = () => buildPixCode({ ...payment, pixKey: "a".repeat(80) });

    expect(act).toThrow(InvalidPixPaymentError);
  });
});

describe("toTransactionId", () => {
  test("keeps only letters and digits, uppercase, up to 25 characters", () => {
    const transactionId = toTransactionId("47d3ebf2-faac-49c2-8198-f62c0e9dcd1b");

    expect(transactionId).toBe("47D3EBF2FAAC49C28198F62C0");
  });
});
