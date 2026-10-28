import { patternFormatter } from "react-number-format";

import { CNPJ_LENGTH, CPF_LENGTH } from "@/shared/tax-document";

const CPF_MASK = "###.###.###-##";
const CNPJ_MASK = "##.###.###/####-##";

/**
 * Formats a CPF or CNPJ as it is typed. Up to 11 digits it follows the CPF mask; past that it
 * switches to the CNPJ mask. Anything that is not a digit is dropped, and so are digits past 14.
 *
 * @param text - What the user typed or pasted.
 * @returns The partially or fully punctuated document.
 *
 * @example
 * maskTaxDocumentInput("5299822"); // "529.982.2"
 * maskTaxDocumentInput("11222333000181"); // "11.222.333/0001-81"
 */
export function maskTaxDocumentInput(text: string): string {
  const digits = text.replaceAll(/\D/g, "").slice(0, CNPJ_LENGTH);
  const mask = digits.length > CPF_LENGTH ? CNPJ_MASK : CPF_MASK;
  return patternFormatter(digits, { format: mask }).replace(/[\s./-]+$/, "");
}
