import { numericFormatter } from "react-number-format";

// R$ 9.999.999,99: far above any top-up, and keeps the typed number a safe integer.
const MAX_AMOUNT_DIGITS = 9;
const DECIMAL_PLACES = 2;
const MIN_AMOUNT_DIGITS = DECIMAL_PLACES + 1;

/**
 * Formats an amount as typed in a banking app: digits fill in from the cents, so typing
 * `15000` shows `150,00` and there is never a comma to type. Leading zeros, letters and
 * digits past the limit are dropped.
 *
 * @param text - What is in the input after the keystroke or paste.
 * @returns The amount as `1.234,56`, or an empty string when there are no digits.
 *
 * @example
 * maskAmountInput("15000"); // "150,00"
 */
export function maskAmountInput(text: string): string {
  const digits = amountDigits(text).replace(/^0+/, "").slice(0, MAX_AMOUNT_DIGITS);
  if (digits === "") {
    return "";
  }
  const padded = digits.padStart(MIN_AMOUNT_DIGITS, "0");
  return numericFormatter(`${padded.slice(0, -DECIMAL_PLACES)}.${padded.slice(-DECIMAL_PLACES)}`, {
    thousandSeparator: ".",
    decimalSeparator: ",",
    decimalScale: DECIMAL_PLACES,
    fixedDecimalScale: true,
    allowNegative: false,
  });
}

export function amountDigits(text: string): string {
  return text.replaceAll(/\D/g, "");
}

/**
 * Applies a key press to the amount the way banking apps do: a digit enters from the right
 * and Backspace removes the last digit, wherever the caret is. When the whole text is
 * selected, the key replaces it.
 *
 * @param current - The masked amount in the input.
 * @param key - `KeyboardEvent.key` of the press.
 * @param replacesAll - Whether the whole text is selected.
 * @returns The new masked amount, or null for keys left to the browser (Tab, arrows, shortcuts).
 *
 * @example
 * applyAmountKey("1,50", "0", false); // "15,00"
 */
export function applyAmountKey(current: string, key: string, replacesAll: boolean): string | null {
  const digits = replacesAll ? "" : amountDigits(current);
  if (/^\d$/.test(key)) {
    return maskAmountInput(`${digits}${key}`);
  }
  if (key === "Backspace") {
    return maskAmountInput(digits.slice(0, -1));
  }
  return null;
}
