import { Building2Icon, IdCardIcon, UserRoundIcon } from "lucide-react";

import { maskTaxDocumentInput } from "./tax-document-mask";

/**
 * Props of the company inputs, shared by sign-up and the "complete registration" step so both
 * ask for the company the same way.
 */
export const ORGANIZATION_FIELDS = {
  organizationName: {
    label: "Nome da empresa",
    icon: Building2Icon,
    type: "text",
    autoComplete: "organization",
    placeholder: "Como sua empresa é conhecida",
  },
  document: {
    label: "CPF ou CNPJ",
    icon: IdCardIcon,
    type: "text",
    inputMode: "numeric",
    autoComplete: "off",
    placeholder: "Só os números",
    hint: "Trabalha como pessoa física? Use o seu CPF.",
    formatValue: maskTaxDocumentInput,
  },
} as const;

/** Props of the person's name input, asked at sign-up and when completing the registration. */
export const PERSON_NAME_FIELD = {
  label: "Seu nome",
  icon: UserRoundIcon,
  type: "text",
  autoComplete: "name",
  placeholder: "Nome e sobrenome",
} as const;
