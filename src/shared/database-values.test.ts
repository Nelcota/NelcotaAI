import { describe, expect, test } from "bun:test";

import { bigintSchema } from "./database-values";

describe("bigintSchema", () => {
  test("accepts a number", () => {
    const result = bigintSchema.parse(1500);

    expect(result).toBe(1500);
  });

  test("converts a numeric string", () => {
    const result = bigintSchema.parse("-250");

    expect(result).toBe(-250);
  });

  test("rejects a value beyond the safe integer range", () => {
    const result = bigintSchema.safeParse("9007199254740993");

    expect(result.success).toBe(false);
  });

  test("rejects a fractional number", () => {
    const result = bigintSchema.safeParse(10.5);

    expect(result.success).toBe(false);
  });

  test("rejects a non-numeric string", () => {
    const result = bigintSchema.safeParse("abc");

    expect(result.success).toBe(false);
  });
});
