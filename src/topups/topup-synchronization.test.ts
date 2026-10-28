import { expect, test } from "bun:test";

import { QueryClient } from "@tanstack/react-query";

import { synchronizeTopups } from "./topup-synchronization";

test("confirmation invalidates balance, counts, monthly totals, and history together", async () => {
  const client = new QueryClient();
  const keys = [
    ["topups", "org-a", "balance"],
    ["topups", "monthly", 24],
    ["topups", "org-a", "month-totals", []],
    ["topups", "org-a", "history", "all"],
  ];
  keys.forEach((key) => client.setQueryData(key, []));
  client.setQueryData(["topups", "org-a", "pending"], [{ id: "request-a" }]);

  await synchronizeTopups(client, ["request-a"], []);

  expect(keys.every((key) => client.getQueryState(key)?.isInvalidated === true)).toBe(true);
  expect(client.getQueryState(["topups", "org-a", "pending"])?.isInvalidated).toBe(false);
  client.clear();
});

test("unchanged pending snapshots do not produce an invalidation loop", async () => {
  const client = new QueryClient();
  client.setQueryData(["topups", "org-a", "balance"], { balance_cents: 5000 });

  await synchronizeTopups(client, ["request-a", "request-b"], ["request-b", "request-a"]);

  expect(client.getQueryState(["topups", "org-a", "balance"])?.isInvalidated).toBe(false);
  client.clear();
});
