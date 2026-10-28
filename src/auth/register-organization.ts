import type { z } from "zod";

import { describeApiError } from "@/shared/api-error";
import { getNelcotaClient } from "@/shared/nelcota";

import type { registerOrganizationSchema } from "./auth.schemas";

// SQLSTATEs raised by register_my_organization (migration V9).
const REGISTER_ORGANIZATION_ERRORS: ReadonlyMap<string, string> = new Map([
  ["P0014", "Sua conta já está ligada a uma empresa."],
  ["P0018", "Já existe uma empresa com este CPF/CNPJ. Fale com o suporte para ter acesso a ela."],
  ["22023", "Confira seu nome, o nome da empresa e o CPF/CNPJ."],
]);

/**
 * Creates the signed-in user's organization and makes them its owner.
 *
 * @param details - Validated person name, company name and CPF/CNPJ digits.
 * @returns A message for the user when it fails, or null on success.
 */
export async function registerOrganization(
  details: z.output<typeof registerOrganizationSchema>,
): Promise<string | null> {
  const { error } = await getNelcotaClient().rpc("register_my_organization", {
    p_person_name: details.name,
    p_organization_name: details.organizationName,
    p_document: details.document,
  });
  if (error == null) {
    return null;
  }
  return describeApiError(error, REGISTER_ORGANIZATION_ERRORS);
}
