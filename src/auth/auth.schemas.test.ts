import { describe, expect, test } from "bun:test";

import {
  changePasswordSchema,
  emailOnlySchema,
  registerOrganizationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpAccountSchema,
  signUpCompanySchema,
} from "./auth.schemas";

describe("signInSchema", () => {
  test("normalizes the e-mail with trim and lowercase", () => {
    const input = { email: "  Ana@Example.COM ", password: "secret" };

    const result = signInSchema.parse(input);

    expect(result.email).toBe("ana@example.com");
  });

  test("rejects an e-mail made only of spaces", () => {
    const input = { email: "   ", password: "secret" };

    const result = signInSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  test("rejects an empty password", () => {
    const input = { email: "ana@example.com", password: "" };

    const result = signInSchema.safeParse(input);

    expect(result.error?.issues[0]?.message).toBe("Informe sua senha.");
  });

  test("rejects a password longer than 256 characters", () => {
    const input = { email: "ana@example.com", password: "a".repeat(257) };

    const result = signInSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("emailOnlySchema", () => {
  test("rejects an address without a domain", () => {
    const input = { email: "ana@" };

    const result = emailOnlySchema.safeParse(input);

    expect(result.error?.issues[0]?.message).toBe("Informe um e-mail válido.");
  });

  test("rejects an address longer than 254 characters", () => {
    const input = { email: `${"a".repeat(250)}@example.com` };

    const result = emailOnlySchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  test("accepts matching passwords with 8 characters", () => {
    const input = { password: "12345678", confirmation: "12345678" };

    const result = resetPasswordSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  test("rejects a password shorter than 8 characters", () => {
    const input = { password: "1234567", confirmation: "1234567" };

    const result = resetPasswordSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  test("reports a mismatch on the confirmation field", () => {
    const input = { password: "12345678", confirmation: "12345679" };

    const result = resetPasswordSchema.safeParse(input);

    expect(result.error?.issues[0]?.path).toEqual(["confirmation"]);
  });
});

describe("changePasswordSchema", () => {
  test("accepts a new password typed twice", () => {
    const input = {
      currentPassword: "antiga-123",
      password: "nova-senha-1",
      confirmation: "nova-senha-1",
    };

    const result = changePasswordSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  test("requires the current password", () => {
    const input = { currentPassword: "", password: "nova-senha-1", confirmation: "nova-senha-1" };

    const result = changePasswordSchema.safeParse(input);

    expect(result.error?.issues[0]?.message).toBe("Informe sua senha atual.");
  });

  test("rejects a new password equal to the current one", () => {
    const input = {
      currentPassword: "mesma-senha",
      password: "mesma-senha",
      confirmation: "mesma-senha",
    };

    const result = changePasswordSchema.safeParse(input);

    expect(result.error?.issues[0]?.path).toEqual(["password"]);
  });

  test("reports a mismatch on the confirmation field", () => {
    const input = {
      currentPassword: "antiga-123",
      password: "nova-senha-1",
      confirmation: "nova-senha-2",
    };

    const result = changePasswordSchema.safeParse(input);

    expect(result.error?.issues[0]?.path).toEqual(["confirmation"]);
  });

  test("rejects a new password shorter than 8 characters", () => {
    const input = { currentPassword: "antiga-123", password: "curta", confirmation: "curta" };

    const result = changePasswordSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("registerOrganizationSchema", () => {
  test("keeps only the digits of a punctuated CNPJ and trims the names", () => {
    const input = {
      name: " Ana ",
      organizationName: " Padaria Nova ",
      document: "11.222.333/0001-81",
    };

    const result = registerOrganizationSchema.parse(input);

    expect(result).toEqual({
      name: "Ana",
      organizationName: "Padaria Nova",
      document: "11222333000181",
    });
  });

  test("rejects a CPF whose check digits do not match", () => {
    const input = { name: "Ana", organizationName: "Padaria", document: "529.982.247-24" };

    const result = registerOrganizationSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  test("rejects an empty document", () => {
    const input = { name: "Ana", organizationName: "Padaria", document: "" };

    const result = registerOrganizationSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  test("rejects a company name made only of spaces", () => {
    const input = { name: "Ana", organizationName: "   ", document: "11222333000181" };

    const result = registerOrganizationSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  test("rejects a name longer than 200 characters", () => {
    const input = {
      name: "a".repeat(201),
      organizationName: "Padaria",
      document: "11222333000181",
    };

    const result = registerOrganizationSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("signUpAccountSchema", () => {
  test("accepts the account step and normalizes the e-mail", () => {
    const input = { name: " Ana ", email: " Ana@Padaria.com ", password: "senha-segura" };

    const result = signUpAccountSchema.parse(input);

    expect(result).toEqual({ name: "Ana", email: "ana@padaria.com", password: "senha-segura" });
  });

  test("rejects a password shorter than 8 characters", () => {
    const input = { name: "Ana", email: "ana@padaria.com", password: "1234567" };

    const result = signUpAccountSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  test("rejects a name made only of spaces", () => {
    const input = { name: "   ", email: "ana@padaria.com", password: "senha-segura" };

    const result = signUpAccountSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("signUpCompanySchema", () => {
  test("keeps only the digits of a masked CPF", () => {
    const input = { organizationName: "Padaria", document: "529.982.247-25" };

    const result = signUpCompanySchema.parse(input);

    expect(result).toEqual({ organizationName: "Padaria", document: "52998224725" });
  });

  test("rejects a CNPJ whose check digits do not match", () => {
    const input = { organizationName: "Padaria", document: "11.222.333/0001-82" };

    const result = signUpCompanySchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});
