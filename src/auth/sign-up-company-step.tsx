import { useForm } from "@tanstack/react-form";
import { ArrowLeftIcon } from "lucide-react";
import type { z } from "zod";

import { REVALIDATE_AFTER_SUBMIT } from "@/shared/form-validation";

import { AuthSubmitButton } from "./auth-submit-button";
import { AuthTextField } from "./auth-text-field";
import { signUpCompanySchema } from "./auth.schemas";
import { ORGANIZATION_FIELDS } from "./organization-fields";

type CompanyValues = z.input<typeof signUpCompanySchema>;

interface SignUpCompanyStepProps {
  readonly initialValues: CompanyValues;
  /** Goes back to the first step, keeping what was typed here. */
  readonly onBack: (values: CompanyValues) => void;
  /** Creates the account; resolves once the attempt is over. */
  readonly onSubmit: (values: z.output<typeof signUpCompanySchema>) => Promise<void>;
}

/** Second sign-up step: company name and CPF/CNPJ, then the account is created. */
export function SignUpCompanyStep({ initialValues, onBack, onSubmit }: SignUpCompanyStepProps) {
  const form = useForm({
    defaultValues: { ...initialValues },
    validationLogic: REVALIDATE_AFTER_SUBMIT,
    validators: { onDynamic: signUpCompanySchema },
    onSubmit: ({ value }) => onSubmit(signUpCompanySchema.parse(value)),
  });

  return (
    <form
      noValidate
      aria-label="Sua empresa"
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="organizationName">
        {(field) => <AuthTextField field={field} {...ORGANIZATION_FIELDS.organizationName} />}
      </form.Field>
      <form.Field name="document">
        {(field) => <AuthTextField field={field} {...ORGANIZATION_FIELDS.document} />}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex flex-col gap-3">
            <AuthSubmitButton label="Criar conta" isSubmitting={isSubmitting} />
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onBack(form.state.values)}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              <ArrowLeftIcon aria-hidden="true" className="size-5" />
              Voltar
            </button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
