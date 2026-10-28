import { unparse } from "papaparse";

import { formatDateTime } from "@/shared/format";
import { centsToBrlInput } from "@/shared/money";

import { type TopupStatus, describeTopupStatus } from "../topup-status";

/** The fields of a request that go into the spreadsheet. */
interface ExportableRequest {
  readonly amount_cents: number;
  readonly status: TopupStatus;
  readonly cancel_reason: string | null;
  readonly created_at: string;
  readonly decided_at: string | null;
}

// Semicolon and comma decimals: what Excel and LibreOffice expect in Brazilian Portuguese.
const SEPARATOR = ";";
const LINE_BREAK = "\r\n";
// Byte order mark, so Excel reads the accents as UTF-8.
const BYTE_ORDER_MARK = "﻿";
const HEADER = ["Pedido em", "Valor (R$)", "Situação", "Creditado em", "Motivo"];
// escapeFormulae neutralises cells starting with =, +, - or @, so a cancel reason typed by an
// admin cannot run as a spreadsheet formula on the customer's machine.
const CSV_OPTIONS = { delimiter: SEPARATOR, newline: LINE_BREAK, escapeFormulae: true } as const;

/**
 * Builds a CSV of top-up requests for the customer's finance team.
 *
 * @param requests - Requests in the order they should appear.
 * @returns The CSV text, with a UTF-8 byte order mark and a header row.
 */
export function requestsToCsv(requests: readonly ExportableRequest[]): string {
  const rows = requests.map((request) => [
    formatDateTime(request.created_at),
    centsToBrlInput(request.amount_cents),
    describeTopupStatus(request.status),
    request.status === "confirmed" && request.decided_at != null
      ? formatDateTime(request.decided_at)
      : "",
    request.cancel_reason ?? "",
  ]);
  return BYTE_ORDER_MARK + unparse([HEADER, ...rows], CSV_OPTIONS);
}
