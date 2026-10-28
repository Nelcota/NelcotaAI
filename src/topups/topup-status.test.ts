import { describe, expect, test } from "bun:test";

import { describeTopupStatus } from "./topup-status";

describe("describeTopupStatus", () => {
  test("labels a request withdrawn by the customer as cancelled", () => {
    const label = describeTopupStatus("withdrawn");

    expect(label).toBe("Cancelado");
  });

  test("tells the customer a pending request awaits confirmation", () => {
    const label = describeTopupStatus("pending");

    expect(label).toBe("Aguardando confirmação");
  });

  test("labels a confirmed request as credited", () => {
    const label = describeTopupStatus("confirmed");

    expect(label).toBe("Creditado");
  });

  test("labels a cancelled request as refused", () => {
    const label = describeTopupStatus("cancelled");

    expect(label).toBe("Recusado");
  });
});
