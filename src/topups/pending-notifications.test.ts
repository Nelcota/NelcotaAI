import { describe, expect, test } from "bun:test";

import { formatCents } from "@/shared/format";

import { describePendingTopupNotifications } from "./pending-notifications";

describe("describePendingTopupNotifications", () => {
  test("describes each payment method", () => {
    const items = describePendingTopupNotifications([
      { id: "a", amount_cents: 5000, payment_method: "manual_pix" },
      { id: "b", amount_cents: 12345, payment_method: "pix" },
      { id: "c", amount_cents: 100, payment_method: "card" },
    ]);

    expect(items).toEqual([
      {
        id: "a",
        title: `Recarga de ${formatCents(5000)}`,
        description: "Pix manual · aguardando o pagamento e a confirmação",
      },
      {
        id: "b",
        title: `Recarga de ${formatCents(12345)}`,
        description: "Pix · aguardando o pagamento do código",
      },
      {
        id: "c",
        title: `Recarga de ${formatCents(100)}`,
        description: "Cartão · pagamento em análise",
      },
    ]);
  });

  test("returns nothing without pending requests", () => {
    expect(describePendingTopupNotifications([])).toEqual([]);
  });
});
