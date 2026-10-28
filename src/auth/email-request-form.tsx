import { useForm } from "@tanstack/react-form";
import { MailCheckIcon, MailIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { REVALIDATE_AFTER_SUBMIT } from "@/shared/form-validation";
import { getNelcotaClient } from "@/shared/nelcota";

import { describeAuthError } from "./auth-error";
import { AuthSubmitButton } from "./auth-submit-button";
import { AuthTextField } from "./auth-text-field";
import { emailOnlySchema } from "./auth.schemas";

type EmailRequestPurpose = "magic_link" | "password_recovery";

const SUBMIT_LABELS = {
  magic_link: "Enviar link de acesso",
  password_recovery: "Enviar link de recuperação",
} as const satisfies Record<EmailRequestPurpose, string>;

/**
 * Asks for an e-mail and sends a magic link or a password recovery link. The confirmation is
 * the same whether or not the account exists, so the form never reveals who is registered.
 */
export function EmailRequestForm({ purpose }: { readonly purpose: EmailRequestPurpose }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "" },
    validationLogic: REVALIDATE_AFTER_SUBMIT,
    validators: { onDynamic: emailOnlySchema },
    onSubmit: async ({ value }) => {
      setErrorMessage(null);
      const { email } = emailOnlySchema.parse(value);
      const auth = getNelcotaClient().auth;
      const { error } =
        purpose === "magic_link"
          ? await auth.sendMagicLink(email)
          : await auth.requestPasswordReset(email);
      if (error != null) {
        setErrorMessage(describeAuthError(error, "send_email"));
        return;
      }
      setSentTo(email);
    },
  });

  if (sentTo != null) {
    return (
      <Alert className="rounded-2xl">
        <MailCheckIcon />
        <AlertTitle>Confira seu e-mail</AlertTitle>
        <AlertDescription>
          Se houver uma conta com {sentTo}, enviamos um link para ela. O link vale por pouco tempo.
        </AlertDescription>
      </Alert>
    );
  }

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
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <AuthSubmitButton label={SUBMIT_LABELS[purpose]} isSubmitting={isSubmitting} />
        )}
      </form.Subscribe>
    </form>
  );
}
