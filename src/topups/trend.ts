/**
 * Percentage change between two periods, rounded to a whole number.
 *
 * @param current - Value of the current period.
 * @param previous - Value of the previous period.
 * @returns The change in percent (negative for a drop), or null when there is no previous
 * value to compare with or either value is not finite.
 *
 * @example
 * percentChange(112, 100); // 12
 */
export function percentChange(current: number, previous: number): number | null {
  if (Number.isFinite(current) === false || Number.isFinite(previous) === false) {
    return null;
  }
  if (previous === 0) {
    return null;
  }
  const change = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return Number.isFinite(change) ? change : null;
}

/**
 * Change of the last value of a monthly series against the month before it.
 *
 * @param values - Monthly values, oldest first.
 * @returns The change in percent, or null with fewer than two months or no previous value.
 */
export function lastMonthChange(values: readonly number[]): number | null {
  if (values.length < 2) {
    return null;
  }
  const current = values.at(-1);
  const previous = values.at(values.length - 2);
  if (current == null || previous == null) {
    return null;
  }
  return percentChange(current, previous);
}

const MONTHS_PER_YEAR = 12;

/** A month of the chosen period with the same month one year before. */
export interface YearOverYearPoint {
  readonly month: string;
  readonly value: number;
  readonly previousYearValue: number | undefined;
}

/**
 * Pairs each month of the last `months` with the same month one year earlier.
 *
 * @param series - Monthly values, oldest first, ideally `months + 12` long.
 * @param months - Length of the period to show; a positive integer.
 * @returns The last `months` entries; `previousYearValue` is undefined when the series does not
 * reach back a full year.
 * @throws {RangeError} When `months` is not a positive integer.
 */
export function yearOverYear(
  series: readonly { readonly month: string; readonly value: number }[],
  months: number,
): YearOverYearPoint[] {
  if (Number.isInteger(months) === false || months < 1) {
    throw new RangeError(`yearOverYear expects a positive integer of months, got ${months}`);
  }
  const start = Math.max(0, series.length - months);
  return series.slice(start).map((entry, offset) => {
    const previousIndex = start + offset - MONTHS_PER_YEAR;
    return {
      month: entry.month,
      value: entry.value,
      previousYearValue: previousIndex >= 0 ? series[previousIndex]?.value : undefined,
    };
  });
}

/**
 * Average of a series, rounded to whole cents.
 *
 * @param values - Amounts in cents.
 * @returns The rounded average, or null for an empty series.
 */
export function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}
