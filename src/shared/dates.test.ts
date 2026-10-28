import { describe, expect, test } from "bun:test";

import { toSaoPauloCalendarDate } from "./dates";

describe("toSaoPauloCalendarDate", () => {
  test("returns the previous day when it is still evening in Sao Paulo", () => {
    const instant = new Date("2026-10-28T02:00:00Z");

    const result = toSaoPauloCalendarDate(instant);

    expect(result).toBe("2026-10-27");
  });

  test("returns the same day after 03:00 UTC", () => {
    const instant = new Date("2026-10-28T03:00:00Z");

    const result = toSaoPauloCalendarDate(instant);

    expect(result).toBe("2026-10-28");
  });

  test("throws RangeError for an invalid date", () => {
    const instant = new Date("not a date");

    const act = () => toSaoPauloCalendarDate(instant);

    expect(act).toThrow(RangeError);
  });
});
