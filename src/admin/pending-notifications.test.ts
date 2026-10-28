import { describe, expect, test } from "bun:test";

import { formatCents, formatDateTime } from "@/shared/format";

import { describePendingRequestNotifications } from "./pending-notifications";

describe("describePendingRequestNotifications", () => {
  test("names the company, the amount and the request time", () => {
    const items = describePendingRequestNotifications([
      {
        id: "a",
        amount_cents: 15000,
        created_at: "2026-10-27T22:07:35Z",
        organization: { name: "Padaria Nova" },
      },
    ]);

    expect(items).toEqual([
      {
        id: "a",
        title: `Padaria Nova · ${formatCents(15000)}`,
        description: `Pix manual · pedido em ${formatDateTime("2026-10-27T22:07:35Z")}`,
      },
    ]);
  });

  test("lists the newest request first", () => {
    const items = describePendingRequestNotifications([
      { id: "old", amount_cents: 100, created_at: "2026-10-01T10:00:00Z", organization: null },
      { id: "new", amount_cents: 200, created_at: "2026-10-02T10:00:00Z", organization: null },
    ]);

    expect(items.map((item) => item.id)).toEqual(["new", "old"]);
  });

  test("names a removed company explicitly", () => {
    const [item] = describePendingRequestNotifications([
      { id: "a", amount_cents: 100, created_at: "2026-10-01T10:00:00Z", organization: null },
    ]);

    expect(item?.title).toBe(`Empresa removida · ${formatCents(100)}`);
  });

  test("returns nothing for an empty queue", () => {
    expect(describePendingRequestNotifications([])).toEqual([]);
  });
});
