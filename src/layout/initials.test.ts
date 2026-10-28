import { describe, expect, test } from "bun:test";

import { initialsOf } from "./initials";

describe("initialsOf", () => {
  test("returns a question mark when the name is null", () => {
    const result = initialsOf(null);

    expect(result).toBe("?");
  });

  test("returns a question mark when the name is blank", () => {
    const result = initialsOf("   ");

    expect(result).toBe("?");
  });

  test("returns a single letter for a single word", () => {
    const result = initialsOf("Maria");

    expect(result).toBe("M");
  });

  test("uses the first and last words when there are several", () => {
    const result = initialsOf("Maria da Silva");

    expect(result).toBe("MS");
  });

  test("ignores extra whitespace around and between words", () => {
    const result = initialsOf("  Maria   Silva  ");

    expect(result).toBe("MS");
  });

  test("upper-cases lowercase input", () => {
    const result = initialsOf("maria silva");

    expect(result).toBe("MS");
  });
});
