import { describe, expect, test } from "bun:test";

import { changePercent } from "./change-percent";

describe("changePercent", () => {
  test("returns the rounded increase in percent", () => {
    const result = changePercent(150, 100);

    expect(result).toBe(50);
  });

  test("returns a negative number for a drop", () => {
    const result = changePercent(75, 100);

    expect(result).toBe(-25);
  });

  test("returns zero when both values are equal", () => {
    const result = changePercent(100, 100);

    expect(result).toBe(0);
  });

  test("rounds half up", () => {
    const result = changePercent(1005, 1000);

    expect(result).toBe(1);
  });

  test("returns null when there is no comparison", () => {
    const result = changePercent(100, null);

    expect(result).toBeNull();
  });

  test("returns null when the comparison is zero", () => {
    const result = changePercent(100, 0);

    expect(result).toBeNull();
  });

  test("returns null when the comparison is negative", () => {
    const result = changePercent(100, -5);

    expect(result).toBeNull();
  });

  test("returns null when the value is not finite", () => {
    const result = changePercent(Number.NaN, 100);

    expect(result).toBeNull();
  });
});
