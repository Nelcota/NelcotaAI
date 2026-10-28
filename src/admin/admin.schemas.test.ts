import { describe, expect, test } from "bun:test";

import {
  adjustBalanceSchema,
  cancelTopupSchema,
  linkUserSchema,
  organizationFormSchema,
  settingsFormSchema,
} from "./admin.schemas";

describe("organizationFormSchema", () => {
  test("keeps only the digits of a punctuated CNPJ", () => {
    const result = organizationFormSchema.parse({
      name: " Padaria Exemplo ",
      document: "11.222.333/0001-81",
    });

    expect(result).toEqual({ name: "Padaria Exemplo", document: "11222333000181" });
  });

  test("accepts a CPF", () => {
    const result = organizationFormSchema.safeParse({ name: "Ana", document: "529.982.247-25" });

    expect(result.success).toBe(true);
  });

  test("rejects a document with 12 digits", () => {
    const result = organizationFormSchema.safeParse({ name: "Ana", document: "123456789012" });

    expect(result.error?.issues[0]?.message).toBe("Informe um CPF ou CNPJ válido.");
  });

  test.each(["12345678901", "00000000000", "11222333000180"])(
    "rejects invalid check digits: %s",
    (document) => {
      expect(
        organizationFormSchema.safeParse({ name: "Test organization", document }).success,
      ).toBe(false);
    },
  );

  test("rejects a blank name", () => {
    const result = organizationFormSchema.safeParse({ name: "   ", document: "52998224725" });

    expect(result.error?.issues[0]?.message).toBe("Informe o nome da empresa.");
  });
});

describe("linkUserSchema", () => {
  test("normalizes the e-mail", () => {
    const result = linkUserSchema.parse({ email: " Maria@Example.COM ", name: "Maria" });

    expect(result.email).toBe("maria@example.com");
  });

  test("rejects an invalid e-mail", () => {
    const result = linkUserSchema.safeParse({ email: "maria", name: "Maria" });

    expect(result.success).toBe(false);
  });
});

describe("adjustBalanceSchema", () => {
  test("converts the amount into cents", () => {
    const result = adjustBalanceSchema.parse({
      direction: "remove",
      amount: "12,50",
      description: "Correção",
    });

    expect(result.amount).toBe(1250);
  });

  test("rejects a zero amount", () => {
    const result = adjustBalanceSchema.safeParse({
      direction: "add",
      amount: "0",
      description: "Correção",
    });

    expect(result.success).toBe(false);
  });

  test("rejects an amount above R$ 1.000.000,00", () => {
    const result = adjustBalanceSchema.safeParse({
      direction: "add",
      amount: "1.000.000,01",
      description: "Correção",
    });

    expect(result.error?.issues[0]?.message).toBe("O ajuste máximo é de R$ 1.000.000,00.");
  });

  test("requires a description", () => {
    const result = adjustBalanceSchema.safeParse({
      direction: "add",
      amount: "10",
      description: "  ",
    });

    expect(result.error?.issues[0]?.message).toBe("Descreva o motivo do ajuste.");
  });
});

describe("cancelTopupSchema", () => {
  test("rejects a reason longer than 500 characters", () => {
    const result = cancelTopupSchema.safeParse({ reason: "a".repeat(501) });

    expect(result.success).toBe(false);
  });
});

describe("settingsFormSchema", () => {
  test("converts the limits into cents", () => {
    const result = settingsFormSchema.parse({
      pixKey: "financeiro@example.com",
      pixReceiverName: "Nelcota AI Ltda",
      pixCity: "SAO PAULO",
      minimum: "20",
      maximum: "5.000",
    });

    expect(result).toMatchObject({ minimum: 2000, maximum: 500000 });
  });

  test("rejects a maximum below the minimum", () => {
    const result = settingsFormSchema.safeParse({
      pixKey: "financeiro@example.com",
      pixReceiverName: "Nelcota AI Ltda",
      pixCity: "SAO PAULO",
      minimum: "100",
      maximum: "50",
    });

    expect(result.error?.issues[0]?.path).toEqual(["maximum"]);
  });

  test("rejects a blank Pix key", () => {
    const result = settingsFormSchema.safeParse({
      pixKey: " ",
      pixReceiverName: "Nelcota AI Ltda",
      pixCity: "SAO PAULO",
      minimum: "20",
      maximum: "5.000",
    });

    expect(result.error?.issues[0]?.message).toBe("Informe a chave Pix.");
  });
});

describe("settingsFormSchema pix city", () => {
  test("rejects a city longer than 15 characters", () => {
    const result = settingsFormSchema.safeParse({
      pixKey: "financeiro@example.com",
      pixReceiverName: "Nelcota AI Ltda",
      pixCity: "Aparecida de Goiânia",
      minimum: "20",
      maximum: "5.000",
    });

    expect(result.error?.issues[0]?.message).toBe("Use no máximo 15 caracteres.");
  });

  test("requires the city", () => {
    const result = settingsFormSchema.safeParse({
      pixKey: "financeiro@example.com",
      pixReceiverName: "Nelcota AI Ltda",
      pixCity: "  ",
      minimum: "20",
      maximum: "5.000",
    });

    expect(result.error?.issues[0]?.message).toBe("Informe a cidade do favorecido.");
  });
});
