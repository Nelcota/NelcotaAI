import { z } from "zod";

import { taxDocumentSchema } from "@/shared/tax-document";

// Limits enforced by Nelcota auth (passwords) and RFC 5321 (e-mail addresses).
const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;
// Same limit as the CHECK constraints on organizations.name and profiles.name (migration V1).
const MAX_NAME_LENGTH = 200;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .normalize("NFC")
  .min(1, "Informe seu e-mail.")
  .max(MAX_EMAIL_LENGTH, "O e-mail é longo demais.")
  .pipe(z.email("Informe um e-mail válido."));

const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .max(MAX_PASSWORD_LENGTH, `A senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`);

const nameSchema = (emptyMessage: string) =>
  z
    .string()
    .trim()
    .normalize("NFC")
    .min(1, emptyMessage)
    .max(MAX_NAME_LENGTH, `Use no máximo ${MAX_NAME_LENGTH} caracteres.`);

/** The company a new customer registers, together with the person's own name. */
export const registerOrganizationSchema = z.object({
  name: nameSchema("Informe seu nome."),
  organizationName: nameSchema("Informe o nome da empresa."),
  document: taxDocumentSchema,
});

/** First sign-up step: who the person is and how they will sign in. */
export const signUpAccountSchema = z.object({
  name: nameSchema("Informe seu nome."),
  email: emailSchema,
  password: newPasswordSchema,
});

/** Second sign-up step: the company the account belongs to. */
export const signUpCompanySchema = registerOrganizationSchema.pick({
  organizationName: true,
  document: true,
});

/** Password sign-in form. The e-mail is trimmed, lowercased and NFC-normalized. */
export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Informe sua senha.")
    .max(MAX_PASSWORD_LENGTH, `A senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`),
});

/** Forms that only ask for an e-mail (magic link, password recovery). */
export const emailOnlySchema = z.object({ email: emailSchema });

/** Choosing a new password after opening a recovery link. */
export const resetPasswordSchema = z
  .object({ password: newPasswordSchema, confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, {
    message: "As senhas não conferem.",
    path: ["confirmation"],
  });

/** Changing the password while signed in: the current one, then the new one twice. */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Informe sua senha atual.")
      .max(MAX_PASSWORD_LENGTH, `A senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`),
    password: newPasswordSchema,
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "As senhas não conferem.",
    path: ["confirmation"],
  })
  .refine((value) => value.password !== value.currentPassword, {
    message: "A nova senha deve ser diferente da atual.",
    path: ["password"],
  });
