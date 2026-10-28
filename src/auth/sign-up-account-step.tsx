import { useForm } from "@tanstack/react-form";
import { cn } from "cn";
import { CircleCheckIcon, CircleIcon, LockIcon, MailIcon } from "lucide-react";
import type { z } from "zod";

import { REVALIDATE_AFTER_SUBMIT } from "@/shared/form-validation";

import { AuthSubmitButton } from "./auth-submit-button";
import { AuthTextField } from "./auth-text-field";
import { MIN_PASSWORD_LENGTH, signUpAccountSchema } from "./auth.schemas";
import { PERSON_NAME_FIELD } from "./organization-fields";

type AccountValues = z.input<typeof signUpAccountSchema>;

interface SignUpAccountStepProps {
  readonly initialValues: AccountValues;
  readonly onContinue: (values: AccountValues) => void;
}

/** First sign-up step: name, e-mail and password. Nothing is sent to the server yet. */
export function SignUpAccountStep({ initialValues, onContinue }: SignUpAccountStepProps) {
  const form = useForm({
    defaultValues: { ...initialValues },
    validationLogic: REVALIDATE_AFTER_SUBMIT,
    validators: { onDynamic: signUpAccountSchema },
    onSubmit: ({ value }) => onContinue(value),
  });

  return (
    <form
      noValidate
      aria-label="Seus dados"
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => <AuthTextField field={field} {...PERSON_NAME_FIELD} />}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <AuthTextField
            field={field}
            label="E-mail"
            icon={MailIcon}
            type="email"
            autoComplete="email"
            placeholder="voce@empresa.com.br"
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <AuthTextField
            field={field}
            label="Crie uma senha"
            icon={LockIcon}
            type="password"
            autoComplete="new-password"
            placeholder="Sua nova senha"
            hint={<PasswordLengthHint password={field.state.value} />}
          />
        )}
      </form.Field>
      <AuthSubmitButton label="Continuar" isSubmitting={false} />
    </form>
  );
}

function PasswordLengthHint({ password }: { readonly password: string }) {
  const isLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const Icon = isLongEnough ? CircleCheckIcon : CircleIcon;

  return (
    <span className={cn("flex items-center gap-1.5", isLongEnough && "text-positive")}>
      <Icon aria-hidden="true" className="size-4" />
      Pelo menos {MIN_PASSWORD_LENGTH} caracteres
    </span>
  );
}
