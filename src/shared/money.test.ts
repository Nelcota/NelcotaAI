import { describe, expect, test } from "bun:test";

import { centsToBrlInput, parseBrlToCents } from "./money";

describe("parseBrlToCents", () => {
  test("reads thousands separators and decimals", () => {
    const cents = parseBrlToCents("1.234,56");

    expect(cents).toBe(123456);
  });

  test("reads an integer amount", () => {
    const cents = parseBrlToCents("50");

    expect(cents).toBe(5000);
  });

  test("reads a single decimal digit as tens of cents", () => {
    const cents = parseBrlToCents("50,5");

    expect(cents).toBe(5050);
  });

  test("accepts the currency symbol and surrounding spaces", () => {
    const cents = parseBrlToCents("  R$ 1.000,00 ");

    expect(cents).toBe(100000);
  });

  test("returns null for an empty text", () => {
    const cents = parseBrlToCents("   ");

    expect(cents).toBeNull();
  });

  test("returns null for a negative amount", () => {
    const cents = parseBrlToCents("-50");

    expect(cents).toBeNull();
  });

  test("returns null for misplaced thousand separators", () => {
    const cents = parseBrlToCents("1.23,45");

    expect(cents).toBeNull();
  });

  test("returns null for more than two decimals", () => {
    const cents = parseBrlToCents("50,123");

    expect(cents).toBeNull();
  });

  test("returns null for letters", () => {
    const cents = parseBrlToCents("cinquenta");

    expect(cents).toBeNull();
  });

  test("returns null when the amount exceeds the safe integer range", () => {
    const cents = parseBrlToCents("99999999999999999999");

    expect(cents).toBeNull();
  });
});

describe("centsToBrlInput", () => {
  test("writes cents with a comma", () => {
    const text = centsToBrlInput(123456);

    expect(text).toBe("1234,56");
  });

  test("pads single-digit cents", () => {
    const text = centsToBrlInput(2005);

    expect(text).toBe("20,05");
  });

  test("throws RangeError for a negative amount", () => {
    const act = () => centsToBrlInput(-1);

    expect(act).toThrow(RangeError);
  });

  test("throws RangeError for a fractional amount", () => {
    const act = () => centsToBrlInput(1.5);

    expect(act).toThrow(RangeError);
  });
});
