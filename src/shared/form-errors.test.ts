import { describe, expect, test } from "bun:test";

import { firstErrorMessage } from "./form-errors";

describe("firstErrorMessage", () => {
  test("reads the message of a schema issue", () => {
    const message = firstErrorMessage([undefined, { message: "Informe seu e-mail." }]);

    expect(message).toBe("Informe seu e-mail.");
  });

  test("accepts plain string errors", () => {
    const message = firstErrorMessage(["Senha curta."]);

    expect(message).toBe("Senha curta.");
  });

  test("skips blank messages", () => {
    const message = firstErrorMessage([{ message: "  " }, "Use outro e-mail."]);

    expect(message).toBe("Use outro e-mail.");
  });

  test("returns null when there is nothing to show", () => {
    const message = firstErrorMessage([undefined, null, { code: "x" }]);

    expect(message).toBeNull();
  });
});
