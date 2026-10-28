import { describe, expect, test } from "bun:test";

import { averageOf, lastMonthChange, percentChange, yearOverYear } from "./trend";

describe("percentChange", () => {
  test("returns a rounded increase", () => {
    const change = percentChange(112.4, 100);

    expect(change).toBe(12);
  });

  test("returns a negative value for a drop", () => {
    const change = percentChange(50, 200);

    expect(change).toBe(-75);
  });

  test("returns null when the previous value is zero", () => {
    const change = percentChange(500, 0);

    expect(change).toBeNull();
  });

  test("returns null for NaN", () => {
    const change = percentChange(Number.NaN, 100);

    expect(change).toBeNull();
  });

  test("returns null for Infinity", () => {
    const change = percentChange(100, Number.POSITIVE_INFINITY);

    expect(change).toBeNull();
  });
});

describe("lastMonthChange", () => {
  test("compares the last two months", () => {
    const change = lastMonthChange([10, 100, 150]);

    expect(change).toBe(50);
  });

  test("returns null with a single month", () => {
    const change = lastMonthChange([100]);

    expect(change).toBeNull();
  });

  test("returns null for an empty series", () => {
    const change = lastMonthChange([]);

    expect(change).toBeNull();
  });
});

describe("yearOverYear", () => {
  const series = Array.from({ length: 15 }, (_, index) => ({
    month: `m${index}`,
    value: index * 10,
  }));

  test("keeps only the last months of the period", () => {
    const points = yearOverYear(series, 3);

    expect(points.map((point) => point.month)).toEqual(["m12", "m13", "m14"]);
  });

  test("pairs each month with the same month one year before", () => {
    const points = yearOverYear(series, 3);

    expect(points.map((point) => point.previousYearValue)).toEqual([0, 10, 20]);
  });

  test("leaves the previous year undefined when the series is too short", () => {
    const points = yearOverYear(series.slice(0, 4), 3);

    expect(points.every((point) => point.previousYearValue === undefined)).toBe(true);
  });

  test("returns an empty list for an empty series", () => {
    const points = yearOverYear([], 3);

    expect(points).toEqual([]);
  });

  test("throws RangeError when months is zero", () => {
    const act = () => yearOverYear(series, 0);

    expect(act).toThrow(RangeError);
  });
});

describe("averageOf", () => {
  test("rounds the average to whole cents", () => {
    const average = averageOf([100, 200, 201]);

    expect(average).toBe(167);
  });

  test("returns null for an empty series", () => {
    const average = averageOf([]);

    expect(average).toBeNull();
  });
});
