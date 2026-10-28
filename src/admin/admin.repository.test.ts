import { afterEach, expect, mock, spyOn, test } from "bun:test";

import { createClient } from "@nelcota/client";

import type { Database } from "@/shared/database";

import { fetchOrganizations, fetchPlatformSummary } from "./admin.repository";

afterEach(() => mock.restore());

test("loads beyond 500 organizations with each organization's own joined balance", async () => {
  const organizations = Array.from({ length: 501 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Organization ${501 - index}`,
    document: "11222333000181",
    status: "active",
    created_at: "2026-10-01T12:00:00Z",
    balance_cents: index + 1,
    month_topup_cents: index + 2,
  }));
  const calls: URL[] = [];
  const implementation = Object.assign(
    (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url);
      const after = url.searchParams.get("id")?.replace(/^gt\./, "") ?? null;
      return Promise.resolve(
        Response.json(organizations.filter((row) => after == null || row.id > after).slice(0, 500)),
      );
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  spyOn(globalThis, "fetch").mockImplementation(implementation);
  const client = createClient<Database>("https://nelcota.example.com", {
    accessToken: () => "test-token",
    auth: { autoRefresh: false },
  });

  const all = await fetchOrganizations(client);
  client.dispose();

  expect(all).toHaveLength(501);
  expect(calls).toHaveLength(2);
  expect(calls.every((url) => url.pathname.endsWith("organization_summaries"))).toBe(true);
  expect(all.find((row) => row.id === organizations[500]?.id)?.balanceCents).toBe(501);
  expect(all.map((row) => row.name)).toEqual(
    organizations.map((row) => row.name).toSorted((a, b) => a.localeCompare(b)),
  );
});

test("reads the platform indicators fresh on every call", async () => {
  let pendingCount = 0;
  const implementation = Object.assign(
    () =>
      Promise.resolve(
        Response.json({
          organization_count: 5,
          active_organization_count: 4,
          month_topup_cents: 9000,
          pending_count: pendingCount,
          pending_cents: pendingCount * 5000,
        }),
      ),
    { preconnect: globalThis.fetch.preconnect },
  );
  spyOn(globalThis, "fetch").mockImplementation(implementation);
  const database = createClient<Database>("https://nelcota.example.com", {
    accessToken: () => "test-token",
    auth: { autoRefresh: false },
  });
  const before = await fetchPlatformSummary(database);

  pendingCount = 1;
  const updated = await fetchPlatformSummary(database);
  database.dispose();

  expect(before.pending_count).toBe(0);
  expect(updated.pending_count).toBe(1);
  expect(updated.pending_cents).toBe(5000);
});
