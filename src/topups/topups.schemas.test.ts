import { describe, expect, test } from "bun:test";

import { createTopupAmountSchema, monthlyTopupSchema } from "./topups.schemas";

const schema = createTopupAmountSchema(2000, 500000);

describe("createTopupAmountSchema", () => {
  test("converts the typed amount into cents", () => {
    const result = schema.parse({ amount: "1.234,56" });

    expect(result.amount).toBe(123456);
  });

  test("accepts exactly the minimum", () => {
    const result = schema.safeParse({ amount: "20" });

    expect(result.success).toBe(true);
  });

  test("accepts exactly the maximum", () => {
    const result = schema.safeParse({ amount: "5.000,00" });

    expect(result.success).toBe(true);
  });

  test("rejects an amount below the minimum with the formatted limit", () => {
    const result = schema.safeParse({ amount: "19,99" });

    expect(result.error?.issues[0]?.message).toBe("O valor mínimo é R$ 20,00.");
  });

  test("rejects an amount above the maximum", () => {
    const result = schema.safeParse({ amount: "5.000,01" });

    expect(result.error?.issues[0]?.message).toBe("O valor máximo é R$ 5.000,00.");
  });

  test("rejects an empty amount", () => {
    const result = schema.safeParse({ amount: "  " });

    expect(result.error?.issues[0]?.message).toBe("Informe o valor da recarga.");
  });

  test("rejects text that is not an amount", () => {
    const result = schema.safeParse({ amount: "cem reais" });

    expect(result.error?.issues[0]?.message).toBe("Informe um valor como 150 ou 1.234,56.");
  });

  test("rejects a negative amount", () => {
    const result = schema.safeParse({ amount: "-50" });

    expect(result.success).toBe(false);
  });
});

describe("monthlyTopupSchema", () => {
  test("accepts a month as YYYY-MM-DD", () => {
    const result = monthlyTopupSchema.safeParse({ month: "2026-10-01", topup_cents: 5000 });

    expect(result.success).toBe(true);
  });

  test("rejects a month in dd/mm/yyyy", () => {
    const result = monthlyTopupSchema.safeParse({ month: "01/10/2026", topup_cents: 5000 });

    expect(result.success).toBe(false);
  });
});
