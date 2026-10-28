import { describe, expect, test } from "bun:test";

import { describeCardRejection } from "./card-rejection";

describe("describeCardRejection", () => {
  test("explains a missing limit", () => {
    const statusDetail = "cc_rejected_insufficient_amount";

    const message = describeCardRejection(statusDetail);

    expect(message).toBe("O cartão não tem limite suficiente. Tente outro cartão ou o Pix.");
  });

  test("asks to check the security code", () => {
    const statusDetail = "cc_rejected_bad_filled_security_code";

    const message = describeCardRejection(statusDetail);

    expect(message).toBe("Confira o código de segurança (CVV) e tente de novo.");
  });

  test("falls back to a generic message for unknown details", () => {
    const statusDetail = "cc_rejected_something_new";

    const message = describeCardRejection(statusDetail);

    expect(message).toBe("O pagamento não foi aprovado. Tente outro cartão ou pague com Pix.");
  });

  test("falls back to a generic message without a detail", () => {
    const statusDetail = null;

    const message = describeCardRejection(statusDetail);

    expect(message).toBe("O pagamento não foi aprovado. Tente outro cartão ou pague com Pix.");
  });
});
