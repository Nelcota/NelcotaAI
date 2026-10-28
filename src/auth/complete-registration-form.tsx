import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { REVALIDATE_AFTER_SUBMIT } from "@/shared/form-validation";

import { AuthSubmitButton } from "./auth-submit-button";
import { AuthTextField } from "./auth-text-field";
import { registerOrganizationSchema } from "./auth.schemas";
import { refreshCurrentProfile } from "./current-profile.query";
import { ORGANIZATION_FIELDS, PERSON_NAME_FIELD } from "./organization-fields";
import { registerOrganization } from "./register-organization";
import { maskTaxDocumentInput } from "./tax-document-mask";

interface CompleteRegistrationFormProps {
  /** Values typed at sign-up, when there are any. */
  readonly initialValues: {
    readonly name: string;
    readonly organizationName: string;
    readonly document: string;
  };
}

/**
 * Asks a signed-in account without an organization for its company and creates it. Reloads
 * the profile on success, so the customer pages appear right away.
 */
export function CompleteRegistrationForm({ initialValues }: CompleteRegistrationFormProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      ...initialValues,
      document: maskTaxDocumentInput(initialValues.document),
    },
    validationLogic: REVALIDATE_AFTER_SUBMIT,
    validators: { onDynamic: registerOrganizationSchema },
    onSubmit: async ({ value }) => {
      setErrorMessage(null);
      const registerError = await registerOrganization(registerOrganizationSchema.parse(value));
      if (registerError != null) {
        setErrorMessage(registerError);
        return;
      }
      await refreshCurrentProfile(queryClient);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {errorMessage != null && (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      <form.Field name="name">
        {(field) => <AuthTextField field={field} {...PERSON_NAME_FIELD} />}
      </form.Field>
      <form.Field name="organizationName">
        {(field) => <AuthTextField field={field} {...ORGANIZATION_FIELDS.organizationName} />}
      </form.Field>
      <form.Field name="document">
        {(field) => <AuthTextField field={field} {...ORGANIZATION_FIELDS.document} />}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <AuthSubmitButton label="Concluir cadastro" isSubmitting={isSubmitting} />
        )}
      </form.Subscribe>
    </form>
  );
}
