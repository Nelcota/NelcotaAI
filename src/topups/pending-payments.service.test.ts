import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { createClient } from "@nelcota/client";
import { QueryClient } from "@tanstack/react-query";

import type { Database } from "@/shared/database";

import { onlinePendingRequestIds, reconcilePendingPayments } from "./pending-payments.service";
import { pendingTopupRequestsQuery } from "./topups.queries";

const PENDING = {
  id: "test-request",
  amount_cents: 5000,
  status: "pending",
  cancel_reason: null,
  receipt_path: null,
  created_at: "2026-10-01T12:00:00Z",
  decided_at: null,
  payment_method: "card",
  pix_qr_code: null,
  pix_expires_at: null,
} as const;

afterEach(() => mock.restore());

function client() {
  return createClient<Database>("https://nelcota.example.com", {
    accessToken: () => "test-token",
    auth: { autoRefresh: false },
  });
}

describe("independent pending reads and payment commands", () => {
  test("selects online requests and leaves manual Pix outside reconciliation", () => {
    const ids = onlinePendingRequestIds([
      { id: "manual", payment_method: "manual_pix" },
      { id: "pix", payment_method: "pix" },
      { id: "card", payment_method: "card" },
    ]);

    expect(ids).toEqual(["pix", "card"]);
    expect(onlinePendingRequestIds([])).toEqual([]);
  });

  test("a failed command does not discard successful commands in the same batch", async () => {
    const result = await reconcilePendingPayments(["unavailable", "paid"], "test-token", (input) =>
      input.requestId === "unavailable"
        ? Promise.reject(new TypeError("payment server unavailable"))
        : Promise.resolve({ ok: true, status: "confirmed" }),
    );

    expect(result).toEqual({ checked: 2, failed: 1 });
  });

  test("classifies a resolved gateway error as retryable failure", async () => {
    const result = await reconcilePendingPayments(["unavailable"], "test-token", () =>
      Promise.resolve({ ok: false, reason: "gateway_error" }),
    );

    expect(result).toEqual({ checked: 1, failed: 1 });
  });

  test("does not call the payment service for an empty batch", async () => {
    const result = await reconcilePendingPayments([], "test-token", () => {
      throw new Error("unexpected payment command");
    });

    expect(result).toEqual({ checked: 0, failed: 0 });
  });

  test("publishes a pending database snapshot while the payment command is still blocked", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json([PENDING]));
    const database = client();
    const queries = new QueryClient();
    const options = pendingTopupRequestsQuery("test-organization", database);
    const transport = Promise.withResolvers<{ readonly ok: true; readonly status: "confirmed" }>();
    const command = reconcilePendingPayments([PENDING.id], "test-token", () => transport.promise);

    const snapshot = await queries.fetchQuery(options);
    transport.reject(new TypeError("payment server HTTP 503"));
    const result = await command;

    expect(snapshot).toEqual([PENDING]);
    expect(queries.getQueryData<typeof snapshot>(options.queryKey)).toEqual([PENDING]);
    expect(result).toEqual({ checked: 1, failed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const input = fetchMock.mock.calls[0]?.[0];
    expect(input instanceof Request ? input.url : input?.toString()).toContain(
      "/rest/v1/topup_requests",
    );
    queries.clear();
    database.dispose();
  });

  test("retains polling after an initial failed read and recovers without a focus event", async () => {
    const fetchMock = spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("database unavailable"),
    );
    const database = client();
    const queries = new QueryClient();
    const options = { ...pendingTopupRequestsQuery("test-organization", database), retry: false };
    await queries.fetchQuery(options).catch(() => null);

    expect(queries.getQueryState(options.queryKey)?.status).toBe("error");
    expect(options.refetchInterval).toBe(30_000);
    fetchMock.mockResolvedValue(Response.json([PENDING]));
    const recovered = await queries.fetchQuery(options);

    expect(recovered).toEqual([PENDING]);
    expect(queries.getQueryState(options.queryKey)?.status).toBe("success");
    queries.clear();
    database.dispose();
  });
});
