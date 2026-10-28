import { describe, expect, spyOn, test } from "bun:test";

import { NelcotaError } from "@nelcota/client";

import { describeApiError } from "./api-error";

const messages = new Map([["P0015", "Você já tem pedidos em aberto."]]);

function apiError(code: string, sqlstate?: string): NelcotaError {
  return new NelcotaError({ status: 400, code, message: "server text", sqlstate });
}

describe("describeApiError", () => {
  test("uses the screen's message for a known SQLSTATE", () => {
    const error = apiError("db_error", "P0015");

    const message = describeApiError(error, messages);

    expect(message).toBe("Você já tem pedidos em aberto.");
  });

  test("explains a permission error when the screen has no specific message", () => {
    const error = apiError("db_error", "42501");

    const message = describeApiError(error, messages);

    expect(message).toBe("Você não tem permissão para fazer isso.");
  });

  test("reports connection problems", () => {
    const error = apiError("network_error");

    const message = describeApiError(error, messages);

    expect(message).toBe(
      "Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.",
    );
  });

  test("asks to wait when rate limited", () => {
    const error = apiError("rate_limited");

    const message = describeApiError(error, messages);

    expect(message).toBe("Muitas tentativas. Aguarde um pouco e tente de novo.");
  });

  test("never shows an unknown SQLSTATE to the user", () => {
    const error = apiError("db_error", "23505");

    const message = describeApiError(error, messages);

    expect(message).toBe("Algo deu errado. Tente de novo em instantes.");
  });

  test("logs and hides errors that did not come from the API", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined);
    const error = new TypeError("boom");

    const message = describeApiError(error, messages);

    expect(message).toBe("Algo deu errado. Tente de novo em instantes.");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
