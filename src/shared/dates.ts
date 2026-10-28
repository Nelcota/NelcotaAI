/** Business time zone: months and days follow the customers' wall clock. */
export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

const calendarDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SAO_PAULO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns the Sao Paulo calendar date of an instant, in ISO format.
 *
 * @param instant - Any valid date.
 * @returns The date as `YYYY-MM-DD`.
 * @throws {RangeError} When the date is invalid.
 *
 * @example
 * toSaoPauloCalendarDate(new Date("2026-10-28T02:00:00Z")); // "2026-10-27"
 */
export function toSaoPauloCalendarDate(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("toSaoPauloCalendarDate received an invalid date");
  }
  const parts = calendarDateFormatter.formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (year == null || month == null || day == null) {
    throw new RangeError(`could not read the calendar date of ${instant.toISOString()}`);
  }
  return `${year}-${month}-${day}`;
}
