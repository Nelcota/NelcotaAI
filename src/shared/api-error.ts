import { NelcotaError } from "@nelcota/client";

const GENERIC_MESSAGE = "Algo deu errado. Tente de novo em instantes.";
const CONNECTION_MESSAGE =
  "Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.";
const NOT_ALLOWED_MESSAGE = "Você não tem permissão para fazer isso.";
const NO_SPECIFIC_MESSAGES: ReadonlyMap<string, string> = new Map();

/**
 * Translates an error from an API call into a message for the user, in Portuguese. Database
 * functions raise specific SQLSTATEs; each screen maps the ones its action can cause.
 *
 * @param error - Whatever the failed call threw or returned.
 * @param messagesBySqlState - Messages for the SQLSTATEs this action can raise, if any.
 * @returns A friendly message; never the server's English text.
 */
export function describeApiError(
  error: unknown,
  messagesBySqlState: ReadonlyMap<string, string> = NO_SPECIFIC_MESSAGES,
): string {
  if (error instanceof NelcotaError === false) {
    console.error("unexpected error from an API call", error);
    return GENERIC_MESSAGE;
  }
  if (error.sqlstate != null) {
    const message = messagesBySqlState.get(error.sqlstate);
    if (message != null) {
      return message;
    }
    if (error.sqlstate === "42501") {
      return NOT_ALLOWED_MESSAGE;
    }
  }
  if (error.code === "network_error" || error.code === "timeout") {
    return CONNECTION_MESSAGE;
  }
  if (error.code === "rate_limited") {
    return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  }
  return GENERIC_MESSAGE;
}
