const DEFAULT_REJECTION_MESSAGE =
  "O pagamento não foi aprovado. Tente outro cartão ou pague com Pix.";

// Mercado Pago `status_detail` values for rejected card payments, in words the customer can
// act on. Unknown values fall back to the default message.
const MESSAGES_BY_STATUS_DETAIL: ReadonlyMap<string, string> = new Map([
  ["cc_rejected_bad_filled_card_number", "Confira o número do cartão e tente de novo."],
  ["cc_rejected_bad_filled_date", "Confira a data de validade do cartão e tente de novo."],
  ["cc_rejected_bad_filled_security_code", "Confira o código de segurança (CVV) e tente de novo."],
  ["cc_rejected_bad_filled_other", "Confira os dados do cartão e tente de novo."],
  [
    "cc_rejected_insufficient_amount",
    "O cartão não tem limite suficiente. Tente outro cartão ou o Pix.",
  ],
  [
    "cc_rejected_call_for_authorize",
    "Seu banco precisa autorizar este pagamento. Fale com o banco e tente de novo.",
  ],
  ["cc_rejected_card_disabled", "Este cartão está desativado. Fale com o banco para ativá-lo."],
  [
    "cc_rejected_duplicated_payment",
    "Já existe um pagamento igual a este. Use outro cartão ou o Pix.",
  ],
  ["cc_rejected_high_risk", "O pagamento foi recusado por segurança. Tente o Pix ou outro cartão."],
  [
    "cc_rejected_max_attempts",
    "Você atingiu o limite de tentativas com este cartão. Use outro cartão.",
  ],
  ["cc_rejected_blacklist", DEFAULT_REJECTION_MESSAGE],
]);

/**
 * Explains why a card payment was not approved.
 *
 * @param statusDetail - The `status_detail` Mercado Pago returned, when there is one.
 * @returns A message in Portuguese that tells the customer what to do next.
 */
export function describeCardRejection(statusDetail: string | null): string {
  if (statusDetail == null) {
    return DEFAULT_REJECTION_MESSAGE;
  }
  return MESSAGES_BY_STATUS_DETAIL.get(statusDetail) ?? DEFAULT_REJECTION_MESSAGE;
}
