import { describe, expect, spyOn, test } from "bun:test";

import {
  describePaymentFailure,
  describePixCreationError,
  formatCountdown,
} from "./payment-messages";
import { PixCreationError, SessionExpiredError } from "./topups.errors";

describe("describePaymentFailure", () => {
  test("asks for support when a payment belongs to another top-up", () => {
    const reason = "duplicate_payment";

    const message = describePaymentFailure(reason);

    expect(message).toBe(
      "Este pagamento já está vinculado a outra recarga. Fale com o suporte para conferir o crédito.",
    );
  });

  test("explains the pending limit", () => {
    const reason = "too_many_pending";

    const message = describePaymentFailure(reason);

    expect(message).toBe(
      "Você já tem 3 recargas aguardando pagamento. Pague ou cancele uma delas para criar outra.",
    );
  });

  test("explains a gateway failure", () => {
    const reason = "gateway_error";

    const message = describePaymentFailure(reason);

    expect(message).toBe(
      "Não conseguimos falar com o Mercado Pago agora. Tente de novo em instantes.",
    );
  });
});

describe("describePixCreationError", () => {
  test("shows the server's reason for a failed creation", () => {
    const error = new PixCreationError("Escolha um valor dentro do limite permitido.");

    const message = describePixCreationError(error);

    expect(message).toBe("Escolha um valor dentro do limite permitido.");
  });

  test("asks to sign in again when the session expired", () => {
    const error = new SessionExpiredError();

    const message = describePixCreationError(error);

    expect(message).toBe("Sua sessão expirou. Entre de novo para continuar.");
  });

  test("falls back to the gateway message and logs unexpected errors", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined);
    const error = new TypeError("fetch failed");

    const message = describePixCreationError(error);

    expect(message).toBe(
      "Não conseguimos falar com o Mercado Pago agora. Tente de novo em instantes.",
    );
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe("formatCountdown", () => {
  test("shows minutes and seconds", () => {
    const timeLeftInMs = 65_000;

    const text = formatCountdown(timeLeftInMs);

    expect(text).toBe("01:05");
  });

  test("rounds a partial second up so it never shows 00:00 too early", () => {
    const timeLeftInMs = 400;

    const text = formatCountdown(timeLeftInMs);

    expect(text).toBe("00:01");
  });

  test("shows 30 minutes in full", () => {
    const timeLeftInMs = 30 * 60_000;

    const text = formatCountdown(timeLeftInMs);

    expect(text).toBe("30:00");
  });

  test("shows 00:00 once expired", () => {
    const timeLeftInMs = -5000;

    const text = formatCountdown(timeLeftInMs);

    expect(text).toBe("00:00");
  });

  test("shows 00:00 for NaN", () => {
    const timeLeftInMs = Number.NaN;

    const text = formatCountdown(timeLeftInMs);

    expect(text).toBe("00:00");
  });
});
