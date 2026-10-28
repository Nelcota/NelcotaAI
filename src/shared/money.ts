/** Cents in one real: the only place where cents are converted to reais and back. */
export const CENTS_PER_REAL = 100;
// Optional "R$", thousands with dots, up to two decimals after a comma: "1.234,56", "50", "50,5".
const BRL_AMOUNT_PATTERN =
  /^(?:R\$\s?)?(?<reais>\d{1,3}(?:\.\d{3})*|\d+)(?:,(?<centavos>\d{1,2}))?$/;

/**
 * Parses an amount typed in Brazilian format into cents.
 *
 * @param input - Text such as `1.234,56`, `R$ 50` or `50,5`.
 * @returns The amount in cents, or null when the text is empty, malformed or not finite.
 *
 * @example
 * parseBrlToCents("1.234,56"); // 123456
 */
export function parseBrlToCents(input: string): number | null {
  const parts = BRL_AMOUNT_PATTERN.exec(input.trim())?.groups;
  const reais = parts?.["reais"];
  if (reais == null) {
    return null;
  }
  const centavos = (parts?.["centavos"] ?? "").padEnd(2, "0");
  const cents = Number(reais.replaceAll(".", "")) * CENTS_PER_REAL + Number(centavos);
  if (Number.isSafeInteger(cents) === false) {
    return null;
  }
  return cents;
}

/**
 * Writes cents back as an editable Brazilian amount (no currency symbol).
 *
 * @param amountInCents - Non-negative integer amount in cents.
 * @returns Text such as `1234,56`, which {@link parseBrlToCents} reads back.
 * @throws {RangeError} When the amount is not a non-negative safe integer.
 */
export function centsToBrlInput(amountInCents: number): string {
  if (Number.isSafeInteger(amountInCents) === false || amountInCents < 0) {
    throw new RangeError(
      `centsToBrlInput expects non-negative integer cents, got ${amountInCents}`,
    );
  }
  const reais = Math.trunc(amountInCents / CENTS_PER_REAL);
  const centavos = String(amountInCents % CENTS_PER_REAL).padStart(2, "0");
  return `${reais},${centavos}`;
}
