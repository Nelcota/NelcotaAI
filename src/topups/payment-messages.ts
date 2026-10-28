import type { PaymentFailureReason } from "@/payments";

import { PixCreationError, SessionExpiredError } from "./topups.errors";

const MESSAGES_BY_REASON = {
  not_configured: "Os pagamentos online ainda não estão disponíveis. Fale com o suporte.",
  session_expired: "Sua sessão expirou. Entre de novo para continuar.",
  invalid_amount: "Escolha um valor dentro do limite permitido.",
  organization_blocked: "Sua empresa está bloqueada para novas recargas. Fale com o suporte.",
  too_many_pending:
    "Você já tem 3 recargas aguardando pagamento. Pague ou cancele uma delas para criar outra.",
  not_found: "Não encontramos esta recarga. Atualize a página e tente de novo.",
  attempt_closed:
    "A tentativa de pagamento anterior foi encerrada. Envie de novo para começar outra.",
  duplicate_payment:
    "Este pagamento já está vinculado a outra recarga. Fale com o suporte para conferir o crédito.",
  payment_in_progress:
    "Um pagamento anterior ainda está sendo conferido. Acompanhe a situação no histórico de recargas.",
  gateway_error: "Não conseguimos falar com o Mercado Pago agora. Tente de novo em instantes.",
} as const satisfies Record<PaymentFailureReason, string>;

/**
 * Explains why a payment could not be started or checked.
 *
 * @param reason - The reason returned by the payment server function.
 * @returns A message in Portuguese for the checkout screen.
 */
export function describePaymentFailure(reason: PaymentFailureReason): string {
  return MESSAGES_BY_REASON[reason];
}

/**
 * Explains why creating a Pix failed, from whatever the checkout mutation threw.
 *
 * @param error - The error thrown while creating the Pix.
 * @returns The server's own reason, the expired-session message, or a generic gateway message
 * for unexpected errors (which are logged).
 */
export function describePixCreationError(error: Error): string {
  if (error instanceof PixCreationError) {
    return error.userMessage;
  }
  if (error instanceof SessionExpiredError) {
    return describePaymentFailure("session_expired");
  }
  console.error("pix creation call failed", error);
  return describePaymentFailure("gateway_error");
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/**
 * Formats the time left to pay a Pix as a countdown.
 *
 * @param timeLeftInMs - Milliseconds until the deadline; zero or less means it expired.
 * @returns Text such as `29:05`, or `00:00` once expired or when not finite.
 *
 * @example
 * formatCountdown(65_000); // "01:05"
 */
export function formatCountdown(timeLeftInMs: number): string {
  if (Number.isFinite(timeLeftInMs) === false || timeLeftInMs <= 0) {
    return "00:00";
  }
  const totalSeconds = Math.ceil(timeLeftInMs / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
