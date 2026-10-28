import { formatCents } from "@/shared/format";

/**
 * Formats an amount as reais, dropping the cents when they are zero: "R$ 50" instead of
 * "R$ 50,00". Shorter for the round amounts of the quick picks and the accepted range.
 *
 * @param amountInCents - Amount in cents.
 * @returns Text such as `R$ 50` or `R$ 50,50`.
 */
export function formatCompactReais(amountInCents: number): string {
  return formatCents(amountInCents).replace(/,00$/, "");
}
