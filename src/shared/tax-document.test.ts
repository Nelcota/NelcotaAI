import { describe, expect, test } from "bun:test";

import { taxDocumentSchema, taxDocumentTypeOf } from "./tax-document";

describe("taxDocumentSchema", () => {
  test("accepts a CPF with valid check digits", () => {
    const cpf = "52998224725";

    const isValid = taxDocumentSchema.safeParse(cpf).success;

    expect(isValid).toBe(true);
  });

  test("accepts a CNPJ with valid check digits", () => {
    const cnpj = "11222333000181";

    const isValid = taxDocumentSchema.safeParse(cnpj).success;

    expect(isValid).toBe(true);
  });

  test("rejects a CPF with a wrong check digit", () => {
    const cpf = "52998224724";

    const isValid = taxDocumentSchema.safeParse(cpf).success;

    expect(isValid).toBe(false);
  });

  test("rejects a CNPJ with a wrong check digit", () => {
    const cnpj = "11222333000182";

    const isValid = taxDocumentSchema.safeParse(cnpj).success;

    expect(isValid).toBe(false);
  });

  test("rejects repeated digits even though their check digits add up", () => {
    const cpf = "11111111111";

    const isValid = taxDocumentSchema.safeParse(cpf).success;

    expect(isValid).toBe(false);
  });

  test("rejects a length that is neither CPF nor CNPJ", () => {
    const digits = "1234567890";

    const isValid = taxDocumentSchema.safeParse(digits).success;

    expect(isValid).toBe(false);
  });

  test("rejects an empty string", () => {
    const digits = "";

    const isValid = taxDocumentSchema.safeParse(digits).success;

    expect(isValid).toBe(false);
  });

  test("strips punctuation before validating", () => {
    const cnpj = "11.222.333/0001-81";

    const result = taxDocumentSchema.safeParse(cnpj);

    expect(result.success).toBe(true);
    expect(result.data).toBe("11222333000181");
  });

  test("explains the error in Portuguese", () => {
    const cpf = "52998224724";

    const result = taxDocumentSchema.safeParse(cpf);

    expect(result.error?.issues[0]?.message).toBe("Informe um CPF ou CNPJ válido.");
  });
});

describe("taxDocumentTypeOf", () => {
  test("returns CPF for 11 digits", () => {
    const type = taxDocumentTypeOf("52998224725");

    expect(type).toBe("CPF");
  });

  test("returns CNPJ for 14 digits", () => {
    const type = taxDocumentTypeOf("11222333000181");

    expect(type).toBe("CNPJ");
  });

  test("throws RangeError for any other length", () => {
    const act = () => taxDocumentTypeOf("123");

    expect(act).toThrow(RangeError);
  });
});
