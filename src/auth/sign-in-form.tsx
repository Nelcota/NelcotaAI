import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { LockIcon, MailIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { REVALIDATE_AFTER_SUBMIT } from "@/shared/form-validation";
import { getNelcotaClient } from "@/shared/nelcota";

import { describeAuthError } from "./auth-error";
import { AuthSubmitButton } from "./auth-submit-button";
import { AuthTextField } from "./auth-text-field";
import { signInSchema } from "./auth.schemas";

/** E-mail and password sign-in. Sends the user to the dashboard on success. */
export function SignInForm() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validationLogic: REVALIDATE_AFTER_SUBMIT,
    validators: { onDynamic: signInSchema },
    onSubmit: async ({ value }) => {
      setErrorMessage(null);
      const credentials = signInSchema.parse(value);
      const { error } = await getNelcotaClient().auth.signInWithPassword(credentials);
      if (error != null) {
        setErrorMessage(describeAuthError(error, "sign_in"));
        return;
      }
      await navigate({ to: "/painel" });
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
            label="Senha"
            icon={LockIcon}
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            labelAction={
              <Link
                to="/recuperar-senha"
                className="rounded-sm text-sm font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Esqueci minha senha
              </Link>
            }
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <AuthSubmitButton label="Entrar" isSubmitting={isSubmitting} />}
      </form.Subscribe>
    </form>
  );
}
