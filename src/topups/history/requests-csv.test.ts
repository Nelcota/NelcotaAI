import { describe, expect, test } from "bun:test";

import { requestsToCsv } from "./requests-csv";

describe("requestsToCsv", () => {
  test("writes a header and one row per request in Brazilian format", () => {
    const csv = requestsToCsv([
      {
        amount_cents: 123456,
        status: "confirmed",
        cancel_reason: null,
        created_at: "2026-10-24T14:30:00Z",
        decided_at: "2026-10-24T16:00:00Z",
      },
    ]);

    expect(csv).toBe(
      "﻿Pedido em;Valor (R$);Situação;Creditado em;Motivo\r\n" +
        "24/10/2026, 11:30;1234,56;Creditado;24/10/2026, 13:00;",
    );
  });

  test("leaves the credit date empty for requests that were not credited", () => {
    const csv = requestsToCsv([
      {
        amount_cents: 5000,
        status: "cancelled",
        cancel_reason: "Pix não encontrado",
        created_at: "2026-10-24T14:30:00Z",
        decided_at: "2026-10-25T14:30:00Z",
      },
    ]);

    expect(csv.split("\r\n")[1]).toBe("24/10/2026, 11:30;50,00;Recusado;;Pix não encontrado");
  });

  test("writes only the header when there are no requests", () => {
    const csv = requestsToCsv([]);

    expect(csv).toBe("﻿Pedido em;Valor (R$);Situação;Creditado em;Motivo");
  });

  test("neutralizes a cancel reason that looks like a formula", () => {
    const csv = requestsToCsv([
      {
        amount_cents: 5000,
        status: "cancelled",
        cancel_reason: '=HYPERLINK("http://x")',
        created_at: "2026-10-24T14:30:00Z",
        decided_at: null,
      },
    ]);

    expect(csv.split("\r\n")[1]).toBe(
      '24/10/2026, 11:30;50,00;Recusado;;"\'=HYPERLINK(""http://x"")"',
    );
  });

  test("neutralizes a cancel reason starting with a minus sign", () => {
    const csv = requestsToCsv([
      {
        amount_cents: 5000,
        status: "cancelled",
        cancel_reason: "-1+1",
        created_at: "2026-10-24T14:30:00Z",
        decided_at: null,
      },
    ]);

    expect(csv.split("\r\n")[1]).toBe('24/10/2026, 11:30;50,00;Recusado;;"\'-1+1"');
  });

  test("quotes a cancel reason containing the separator", () => {
    const csv = requestsToCsv([
      {
        amount_cents: 5000,
        status: "cancelled",
        cancel_reason: "valor errado; refazer",
        created_at: "2026-10-24T14:30:00Z",
        decided_at: null,
      },
    ]);

    expect(csv.split("\r\n")[1]).toBe('24/10/2026, 11:30;50,00;Recusado;;"valor errado; refazer"');
  });
});
