import { describe, expect, test } from "bun:test";

import { maskTaxDocumentInput } from "./tax-document-mask";

describe("maskTaxDocumentInput", () => {
  test("punctuates a partial CPF as it is typed", () => {
    const typed = "5299822";

    const masked = maskTaxDocumentInput(typed);

    expect(masked).toBe("529.982.2");
  });

  test("punctuates a complete CPF", () => {
    const typed = "52998224725";

    const masked = maskTaxDocumentInput(typed);

    expect(masked).toBe("529.982.247-25");
  });

  test("switches to the CNPJ mask after the 11th digit", () => {
    const typed = "112223330001";

    const masked = maskTaxDocumentInput(typed);

    expect(masked).toBe("11.222.333/0001");
  });

  test("punctuates a complete CNPJ", () => {
    const typed = "11222333000181";

    const masked = maskTaxDocumentInput(typed);

    expect(masked).toBe("11.222.333/0001-81");
  });

  test("drops letters, old punctuation and digits past 14", () => {
    const pasted = "CNPJ: 11.222.333/0001-81 99";

    const masked = maskTaxDocumentInput(pasted);

    expect(masked).toBe("11.222.333/0001-81");
  });

  test("returns an empty string when there are no digits", () => {
    const typed = "abc";

    const masked = maskTaxDocumentInput(typed);

    expect(masked).toBe("");
  });
});
