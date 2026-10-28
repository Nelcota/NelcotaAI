import { describe, expect, spyOn, test } from "bun:test";

import { NelcotaError } from "@nelcota/client";

import { describeAuthError, describePasswordChangeError } from "./auth-error";

describe("describeAuthError", () => {
  test("uses a generic credentials message for a failed sign-in", () => {
    const error = { code: "invalid_grant", retryAfter: undefined };

    const message = describeAuthError(error, "sign_in");

    expect(message).toBe("E-mail ou senha inválidos.");
  });

  test("explains an expired link when opening an e-mail link", () => {
    const error = { code: "invalid_grant", retryAfter: undefined };

    const message = describeAuthError(error, "open_link");

    expect(message).toBe("Este link é inválido ou expirou. Peça um novo.");
  });

  test("includes the wait time when rate limited", () => {
    const error = { code: "rate_limited", retryAfter: 12.2 };

    const message = describeAuthError(error, "sign_in");

    expect(message).toBe("Muitas tentativas. Aguarde 13 segundos e tente de novo.");
  });

  test("omits the wait time when the server sends none", () => {
    const error = { code: "rate_limited", retryAfter: undefined };

    const message = describeAuthError(error, "send_email");

    expect(message).toBe("Muitas tentativas. Aguarde um pouco e tente de novo.");
  });

  test("ignores a non-finite wait time", () => {
    const error = { code: "rate_limited", retryAfter: Number.NaN };

    const message = describeAuthError(error, "sign_in");

    expect(message).toBe("Muitas tentativas. Aguarde um pouco e tente de novo.");
  });

  test("reports connection problems", () => {
    const error = { code: "network_error", retryAfter: undefined };

    const message = describeAuthError(error, "sign_in");

    expect(message).toBe(
      "Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.",
    );
  });

  test("explains that e-mail flows are not configured", () => {
    const error = { code: "magiclink_disabled", retryAfter: undefined };

    const message = describeAuthError(error, "send_email");

    expect(message).toBe("Esta opção ainda não está disponível. Fale com o suporte.");
  });

  test("points to sign-in when the e-mail already has an account", () => {
    const error = { code: "user_already_exists", retryAfter: undefined };

    const message = describeAuthError(error, "sign_up");

    expect(message).toBe("Já existe uma conta com este e-mail. Entre ou recupere sua senha.");
  });

  test("falls back to a generic message for unknown codes", () => {
    const error = { code: "something_new", retryAfter: undefined };

    const message = describeAuthError(error, "sign_in");

    expect(message).toBe("Algo deu errado. Tente de novo em instantes.");
  });
});

describe("describePasswordChangeError", () => {
  test("says the current password is wrong when the server rejects the grant", () => {
    const error = new NelcotaError({ status: 400, code: "invalid_grant", message: "server text" });

    const message = describePasswordChangeError(error);

    expect(message).toBe("A senha atual está incorreta.");
  });

  test("translates other Nelcota errors as a sign-in error", () => {
    const error = new NelcotaError({ status: 400, code: "weak_password", message: "server text" });

    const message = describePasswordChangeError(error);

    expect(message).toBe("Escolha uma senha de 8 a 256 caracteres.");
  });

  test("logs and hides errors that did not come from Nelcota", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined);
    const error = new TypeError("boom");

    const message = describePasswordChangeError(error);

    expect(message).toBe("Algo deu errado. Tente de novo em instantes.");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
