import { expect, test } from "bun:test";

import { skipToken } from "@tanstack/react-query";

import {
  monthCreditTotalsQuery,
  monthlyTopupsQuery,
  organizationBalanceQuery,
  pendingTopupRequestsQuery,
  topupHistoryQuery,
} from "./topups.queries";

test("financial queries refresh even when a payment never appears in a pending snapshot", () => {
  const options = [
    organizationBalanceQuery("organization"),
    monthlyTopupsQuery(12),
    monthCreditTotalsQuery("organization", ["2026-10-01"]),
    topupHistoryQuery("organization", "all"),
    topupHistoryQuery("organization", "confirmed"),
    pendingTopupRequestsQuery("organization"),
  ];

  expect(options.every((option) => option.refetchInterval === 30_000)).toBe(true);
});

test("pending requests query stays idle while the organization is unknown", () => {
  const options = pendingTopupRequestsQuery(null);

  expect(options.queryFn).toBe(skipToken);
});

test("pending requests query fetches once the organization is known", () => {
  const options = pendingTopupRequestsQuery("organization");

  expect(typeof options.queryFn).toBe("function");
});
