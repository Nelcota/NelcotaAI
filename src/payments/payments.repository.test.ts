import { afterEach, expect, mock, spyOn, test } from "bun:test";

import { createClient } from "@nelcota/client";

import type { Database } from "@/shared/database";

import { applyPaymentStatus } from "./payments.repository";

const REQUEST_ID = "00000000-0000-4000-8000-000000000001";
afterEach(() => mock.restore());

test("persists the original Pix deadline when the provider omits it from a response", async () => {
  const writes: { name: string; body: unknown }[] = [];
  const implementation = Object.assign(
    (input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const body: unknown = typeof options?.body === "string" ? JSON.parse(options.body) : null;
      writes.push({ name: url.pathname.split("/").at(-1) ?? "", body });
      return Promise.resolve(
        Response.json(url.pathname.endsWith("apply_mercado_pago_status") ? "pending" : null),
      );
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  spyOn(globalThis, "fetch").mockImplementation(implementation);
  const service = createClient<Database>("https://nelcota.example.com", {
    accessToken: () => "test-token",
    auth: { autoRefresh: false },
  });

  const status = await applyPaymentStatus(
    service,
    REQUEST_ID,
    {
      id: 123,
      status: "pending",
      transaction_amount: 50,
      date_last_updated: "2026-10-27T22:01:00Z",
      point_of_interaction: { transaction_data: { qr_code: "test-qr-code" } },
    },
    "2026-10-27T22:00:00Z",
  );
  service.dispose();

  expect(status).toBe("pending");
  expect(writes).toEqual([
    {
      name: "record_mercado_pago_payment",
      body: {
        p_request_id: REQUEST_ID,
        p_provider_payment_id: "123",
        p_pix_qr_code: "test-qr-code",
        p_pix_expires_at: "2026-10-27T22:30:00.000Z",
      },
    },
    {
      name: "apply_mercado_pago_status",
      body: {
        p_request_id: REQUEST_ID,
        p_provider_payment_id: "123",
        p_provider_status: "pending",
        p_amount_cents: 5000,
        p_provider_updated_at: "2026-10-27T22:01:00Z",
      },
    },
  ]);
});
