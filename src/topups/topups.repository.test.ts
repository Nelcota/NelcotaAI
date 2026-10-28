import { afterEach, expect, mock, spyOn, test } from "bun:test";

import { createClient } from "@nelcota/client";

import type { Database } from "@/shared/database";

import { fetchRequestsForExport } from "./topups.repository";

const CREATED_AT = "2026-10-01T12:00:00.123456Z";
afterEach(() => mock.restore());

test("CSV export includes more than 1000 requests with tied timestamps and preserves its filter", async () => {
  const requests = Array.from({ length: 1005 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(1005 - index).padStart(12, "0")}`,
    amount_cents: 5000,
    status: "confirmed" as const,
    cancel_reason: null,
    receipt_path: null,
    created_at: CREATED_AT,
    decided_at: CREATED_AT,
    payment_method: "card" as const,
    pix_qr_code: null,
    pix_expires_at: null,
  }));
  const calls: URL[] = [];
  const implementation = Object.assign(
    (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url);
      const lastId = url.searchParams.get("or")?.match(/id\.lt\."?([\da-f-]+)/)?.[1] ?? null;
      const page = requests
        .filter((request) => lastId == null || request.id < lastId)
        .slice(0, 1000);
      return Promise.resolve(Response.json(page));
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  spyOn(globalThis, "fetch").mockImplementation(implementation);
  const client = createClient<Database>("https://nelcota.example.com", {
    accessToken: () => "test-token",
    auth: { autoRefresh: false },
  });

  const exported = await fetchRequestsForExport(
    "00000000-0000-4000-8000-000000000001",
    "confirmed",
    client,
  );
  client.dispose();

  expect(exported).toEqual(requests);
  expect(calls).toHaveLength(2);
  expect(calls.every((url) => url.searchParams.get("status") === "eq.confirmed")).toBe(true);
  expect(calls.every((url) => url.searchParams.get("order") === "created_at.desc,id.desc")).toBe(
    true,
  );
  expect(calls[1]?.searchParams.get("or")).toContain(CREATED_AT);
});
