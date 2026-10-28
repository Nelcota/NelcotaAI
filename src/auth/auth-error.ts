import { NelcotaError } from "@nelcota/client";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./auth.schemas";

/** What the user was trying to do, since the same server code can mean different things. */
export type AuthAction = "sign_in" | "sign_up" | "send_email" | "open_link";

/** Fallback for errors that have no specific explanation for the user. */
const GENERIC_MESSAGE = "Algo deu errado. Tente de novo em instantes.";
const CONNECTION_MESSAGE =
  "Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.";
const UNAVAILABLE_FLOW_MESSAGE = "Esta opção ainda não está disponível. Fale com o suporte.";

// Codes whose message does not depend on the action. The SDK accepts any string as a code,
// so unknown codes fall back to the generic message.
const MESSAGES_BY_CODE: ReadonlyMap<string, string> = new Map([
  ["network_error", CONNECTION_MESSAGE],
  ["timeout", CONNECTION_MESSAGE],
  ["mail_busy", "O envio de e-mails está ocupado. Tente de novo em instantes."],
  ["email_not_confirmed", "Confirme seu e-mail antes de entrar."],
  ["invalid_email", "Informe um e-mail válido."],
  [
    "weak_password",
    `Escolha uma senha de ${MIN_PASSWORD_LENGTH} a ${MAX_PASSWORD_LENGTH} caracteres.`,
  ],
  ["user_already_exists", "Já existe uma conta com este e-mail. Entre ou recupere sua senha."],
  ["signup_disabled", "O cadastro está fechado no momento. Fale com o suporte."],
  ["recovery_disabled", UNAVAILABLE_FLOW_MESSAGE],
  ["magiclink_disabled", UNAVAILABLE_FLOW_MESSAGE],
]);

/**
 * Translates a Nelcota auth error into a message for the user, in Portuguese.
 *
 * @param error - The error returned by the SDK.
 * @param action - The action that failed.
 * @returns A friendly message that never reveals whether an account exists.
 */
export function describeAuthError(
  error: Pick<NelcotaError, "code" | "retryAfter">,
  action: AuthAction,
): string {
  if (error.code === "invalid_grant" || error.code === "invalid_credentials") {
    return action === "open_link"
      ? "Este link é inválido ou expirou. Peça um novo."
      : "E-mail ou senha inválidos.";
  }
  if (error.code === "rate_limited") {
    return describeRateLimit(error.retryAfter);
  }
  return MESSAGES_BY_CODE.get(error.code) ?? GENERIC_MESSAGE;
}

/**
 * Translates an error raised while changing the password into a message for the user.
 *
 * @param error - Whatever the password change rejected with.
 * @returns A friendly message in Portuguese; unexpected errors are logged and get the generic one.
 */
export function describePasswordChangeError(error: unknown): string {
  if (error instanceof NelcotaError && error.code === "invalid_grant") {
    return "A senha atual está incorreta.";
  }
  if (error instanceof NelcotaError) {
    return describeAuthError(error, "sign_in");
  }
  console.error("unexpected error while changing the password", error);
  return GENERIC_MESSAGE;
}

function describeRateLimit(retryAfterInSeconds: number | undefined): string {
  if (retryAfterInSeconds == null || Number.isFinite(retryAfterInSeconds) === false) {
    return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  }
  const seconds = Math.max(1, Math.ceil(retryAfterInSeconds));
  return `Muitas tentativas. Aguarde ${seconds} segundos e tente de novo.`;
}
