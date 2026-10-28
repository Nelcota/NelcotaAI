import { describe, expect, test } from "bun:test";

import { formatCompactReais } from "./compact-reais";

const NBSP = " ";

describe("formatCompactReais", () => {
  test("drops the cents of a round amount", () => {
    const amountInCents = 5000;

    const text = formatCompactReais(amountInCents);

    expect(text).toBe(`R$${NBSP}50`);
  });

  test("keeps the cents when they are not zero", () => {
    const amountInCents = 5050;

    const text = formatCompactReais(amountInCents);

    expect(text).toBe(`R$${NBSP}50,50`);
  });

  test("keeps the thousands separator of a round amount", () => {
    const amountInCents = 123_400;

    const text = formatCompactReais(amountInCents);

    expect(text).toBe(`R$${NBSP}1.234`);
  });

  test("shows zero without cents", () => {
    const amountInCents = 0;

    const text = formatCompactReais(amountInCents);

    expect(text).toBe(`R$${NBSP}0`);
  });
});
