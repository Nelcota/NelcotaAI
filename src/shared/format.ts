import { SAO_PAULO_TIME_ZONE } from "./dates";
import { CENTS_PER_REAL } from "./money";

const CALENDAR_DATE_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;
const CPF_PATTERN = /^(\d{3})(\d{3})(\d{3})(\d{2})$/;
const CNPJ_PATTERN = /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/;
const SHORT_MONTH_NAMES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integerFormatter = new Intl.NumberFormat("pt-BR");
const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const monthYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SAO_PAULO_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SAO_PAULO_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SAO_PAULO_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Formats an amount in cents as Brazilian reais.
 *
 * @param amountInCents - Integer amount in cents; may be negative.
 * @returns The amount as currency, for example `R$ 1.234,56`.
 * @throws {RangeError} When the amount is not a finite integer.
 *
 * @example
 * formatCents(123456); // "R$ 1.234,56"
 */
export function formatCents(amountInCents: number): string {
  if (Number.isInteger(amountInCents) === false) {
    throw new RangeError(`formatCents expects an integer amount in cents, got ${amountInCents}`);
  }
  return currencyFormatter.format(amountInCents / CENTS_PER_REAL);
}

/**
 * Splits a formatted amount into currency symbol and number, so screens can draw the symbol
 * smaller, as in the reference design.
 *
 * @param amountInCents - Integer amount in cents; may be negative.
 * @returns The symbol (`R$`, with the sign when negative) and the number (`1.234,56`).
 * @throws {RangeError} When the amount is not a finite integer.
 */
export function formatCentsParts(amountInCents: number): { symbol: string; amount: string } {
  if (Number.isInteger(amountInCents) === false) {
    throw new RangeError(`formatCentsParts expects integer cents, got ${amountInCents}`);
  }
  const parts = currencyFormatter.formatToParts(amountInCents / CENTS_PER_REAL);
  const symbol = parts
    .filter((part) => part.type === "currency" || part.type === "minusSign")
    .map((part) => part.value)
    .join("");
  const amount = parts
    .filter((part) => ["integer", "group", "decimal", "fraction"].includes(part.type))
    .map((part) => part.value)
    .join("");
  return { symbol, amount };
}

/**
 * Formats cents as a short currency label for chart axes.
 *
 * @param amountInCents - Integer amount in cents.
 * @returns A compact label, for example `R$ 1,5 mil`.
 * @throws {RangeError} When the amount is not a finite integer.
 */
export function formatCompactCents(amountInCents: number): string {
  if (Number.isInteger(amountInCents) === false) {
    throw new RangeError(`formatCompactCents expects integer cents, got ${amountInCents}`);
  }
  return compactCurrencyFormatter.format(amountInCents / CENTS_PER_REAL);
}

/**
 * Formats an instant as the full Sao Paulo date shown in the page header.
 *
 * @param instant - Any valid date.
 * @returns The date with the weekday, for example `terça-feira, 27 de outubro de 2026`.
 * @throws {RangeError} When the date is invalid.
 */
export function formatLongDate(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("formatLongDate received an invalid date");
  }
  return longDateFormatter.format(instant);
}

/**
 * Formats an integer count with Brazilian thousand separators.
 *
 * @param value - A finite integer.
 * @returns The formatted number, for example `1.234`.
 * @throws {RangeError} When the value is not a finite integer.
 */
export function formatInteger(value: number): string {
  if (Number.isInteger(value) === false) {
    throw new RangeError(`formatInteger expects an integer, got ${value}`);
  }
  return integerFormatter.format(value);
}

/**
 * Formats a UTC timestamp as a Sao Paulo date.
 *
 * @param isoTimestamp - ISO 8601 timestamp, for example `2026-10-24T14:30:00Z`.
 * @returns The date as `dd/mm/aaaa`.
 * @throws {RangeError} When the timestamp cannot be parsed.
 */
export function formatDate(isoTimestamp: string): string {
  return dateFormatter.format(parseTimestamp(isoTimestamp));
}

/**
 * Formats a UTC timestamp as a Sao Paulo date and time.
 *
 * @param isoTimestamp - ISO 8601 timestamp, for example `2026-10-24T14:30:00Z`.
 * @returns The date and time as `dd/mm/aaaa, hh:mm`.
 * @throws {RangeError} When the timestamp cannot be parsed.
 */
export function formatDateTime(isoTimestamp: string): string {
  return dateTimeFormatter.format(parseTimestamp(isoTimestamp));
}

/**
 * Formats the month of a calendar date as a short label for chart axes.
 *
 * @param calendarDate - Any day of the month, as `YYYY-MM-DD`.
 * @returns The month as `mmm/aa`, for example `out/26`.
 * @throws {RangeError} When the date is not in `YYYY-MM-DD` format or the month is invalid.
 */
export function formatShortMonth(calendarDate: string): string {
  const parts = CALENDAR_DATE_PATTERN.exec(calendarDate)?.groups;
  const monthName = SHORT_MONTH_NAMES[Number(parts?.["month"]) - 1];
  const year = parts?.["year"];
  if (monthName == null || year == null) {
    throw new RangeError(`formatShortMonth expects YYYY-MM-DD, got "${calendarDate}"`);
  }
  return `${monthName}/${year.slice(-"aa".length)}`;
}

/**
 * Formats a CPF or CNPJ with its usual punctuation.
 *
 * @param document - 11 (CPF) or 14 (CNPJ) digits, without punctuation.
 * @returns `000.000.000-00` or `00.000.000/0000-00`; other inputs are returned unchanged.
 */
export function formatDocument(document: string): string {
  const cpf = CPF_PATTERN.exec(document);
  if (cpf != null) {
    const [, first, second, third, digits] = cpf;
    return `${first}.${second}.${third}-${digits}`;
  }
  const cnpj = CNPJ_PATTERN.exec(document);
  if (cnpj != null) {
    const [, first, second, third, branch, digits] = cnpj;
    return `${first}.${second}.${third}/${branch}-${digits}`;
  }
  return document;
}

/**
 * Formats the month of a calendar date as a heading.
 *
 * @param calendarDate - Any day of the month, as `YYYY-MM-DD`.
 * @returns The month and year, for example `outubro de 2026`.
 * @throws {RangeError} When the date is not in `YYYY-MM-DD` format.
 */
export function formatMonthYear(calendarDate: string): string {
  if (CALENDAR_DATE_PATTERN.test(calendarDate) === false) {
    throw new RangeError(`formatMonthYear expects YYYY-MM-DD, got "${calendarDate}"`);
  }
  // Noon UTC of a calendar day never crosses into another month in any time zone used here.
  return monthYearFormatter.format(parseTimestamp(`${calendarDate}T12:00:00Z`));
}

function parseTimestamp(isoTimestamp: string): Date {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`invalid timestamp "${isoTimestamp}"`);
  }
  return date;
}

/**
 * Counts top-up requests for the user, with the right plural.
 *
 * @param count - Number of requests, a non-negative integer.
 * @returns Text such as `1 pedido` or `12 pedidos`.
 */
export function formatRequestCount(count: number): string {
  return `${formatInteger(count)} ${count === 1 ? "pedido" : "pedidos"}`;
}
