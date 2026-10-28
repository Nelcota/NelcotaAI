import { isCNPJ, isCPF } from "validation-br";
import { z } from "zod";

/** Digits in a CPF, without punctuation. */
export const CPF_LENGTH = 11;
/** Digits in a CNPJ, without punctuation. */
export const CNPJ_LENGTH = 14;
/** A CPF or CNPJ as digits only: exactly 11 or 14 of them. */
export const TAX_DOCUMENT_DIGITS_PATTERN = /^(\d{11}|\d{14})$/;

/**
 * Checks whether a CPF or CNPJ has valid check digits.
 *
 * @param digits - 11 (CPF) or 14 (CNPJ) digits, without punctuation.
 * @returns True for a well-formed CPF or CNPJ; false otherwise, including repeated digits
 * like `00000000000`, which pass the arithmetic but are never issued.
 *
 */
function isValidTaxDocument(digits: string): boolean {
  if (TAX_DOCUMENT_DIGITS_PATTERN.test(digits) === false) {
    return false;
  }
  return digits.length === CPF_LENGTH ? isCPF(digits) : isCNPJ(digits);
}

/** Normalizes a CPF/CNPJ and validates its check digits for every form and server entry. */
export const taxDocumentSchema = z
  .string()
  .transform((text) => text.replaceAll(/\D/g, ""))
  .refine(isValidTaxDocument, { message: "Informe um CPF ou CNPJ válido." });

/**
 * Tells a CPF from a CNPJ by its length.
 *
 * @param digits - 11 (CPF) or 14 (CNPJ) digits, without punctuation.
 * @returns `"CPF"` or `"CNPJ"`.
 * @throws {RangeError} When the text is not 11 or 14 digits.
 */
export function taxDocumentTypeOf(digits: string): "CPF" | "CNPJ" {
  if (TAX_DOCUMENT_DIGITS_PATTERN.test(digits) === false) {
    throw new RangeError(`expected 11 or 14 digits, got ${digits.length} characters`);
  }
  return digits.length === CPF_LENGTH ? "CPF" : "CNPJ";
}
