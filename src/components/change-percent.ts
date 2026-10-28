/**
 * Percentage change of a value against a comparison, rounded to a whole number.
 *
 * @param value - The current amount.
 * @param comparison - The amount it is compared against.
 * @returns The change in percent, or null when there is nothing to compare against (the
 * comparison is missing, zero or negative) or either number is not finite.
 *
 * @example
 * changePercent(150, 100); // 50
 */
export function changePercent(value: number, comparison: number | null | undefined): number | null {
  if (comparison == null || comparison <= 0) {
    return null;
  }
  if (Number.isFinite(value) === false || Number.isFinite(comparison) === false) {
    return null;
  }
  return Math.round(((value - comparison) / comparison) * 100);
}
