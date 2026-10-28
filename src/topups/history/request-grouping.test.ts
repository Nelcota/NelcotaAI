import { describe, expect, test } from "bun:test";

import { groupRequestsByMonth } from "./request-grouping";

describe("groupRequestsByMonth", () => {
  test("groups by Sao Paulo month, newest first, keeping the order", () => {
    const requests = [
      { id: "c", amount_cents: 300, status: "confirmed", created_at: "2026-11-01T02:00:00Z" },
      { id: "b", amount_cents: 200, status: "confirmed", created_at: "2026-10-15T12:00:00Z" },
      { id: "a", amount_cents: 100, status: "pending", created_at: "2026-10-02T12:00:00Z" },
    ];

    const groups = groupRequestsByMonth(requests);

    // 2026-11-01T02:00Z is still 31 October in Sao Paulo.
    expect(groups.map((group) => group.month)).toEqual(["2026-10-01"]);
    expect(groups[0]?.requests.map((request) => request.id)).toEqual(["c", "b", "a"]);
  });

  test("sums only confirmed requests as credited", () => {
    const requests = [
      { amount_cents: 5000, status: "confirmed", created_at: "2026-10-20T12:00:00Z" },
      { amount_cents: 7000, status: "cancelled", created_at: "2026-10-10T12:00:00Z" },
      { amount_cents: 1000, status: "confirmed", created_at: "2026-10-05T12:00:00Z" },
    ];

    const groups = groupRequestsByMonth(requests);

    expect(groups[0]?.creditedCents).toBe(6000);
  });

  test("creates one group per month", () => {
    const requests = [
      { amount_cents: 100, status: "confirmed", created_at: "2026-10-20T12:00:00Z" },
      { amount_cents: 100, status: "confirmed", created_at: "2026-09-20T12:00:00Z" },
    ];

    const groups = groupRequestsByMonth(requests);

    expect(groups.map((group) => group.month)).toEqual(["2026-10-01", "2026-09-01"]);
  });

  test("returns no groups for no requests", () => {
    const groups = groupRequestsByMonth([]);

    expect(groups).toEqual([]);
  });

  test("throws RangeError for an invalid date", () => {
    const act = () =>
      groupRequestsByMonth([{ amount_cents: 1, status: "pending", created_at: "ontem" }]);

    expect(act).toThrow(RangeError);
  });
});
