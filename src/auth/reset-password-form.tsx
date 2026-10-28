import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { LockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { REVALIDATE_AFTER_SUBMIT } from "@/shared/form-validation";
import { getNelcotaClient } from "@/shared/nelcota";

import { describeAuthError } from "./auth-error";
import { AuthSubmitButton } from "./auth-submit-button";
import { AuthTextField } from "./auth-text-field";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, resetPasswordSchema } from "./auth.schemas";

/**
 * Sets a new password using the token of a recovery link, then signs the user in.
 *
 * @param token - Token read from the recovery link with `readEmailLink()`.
 */
export function ResetPasswordForm({ token }: { readonly token: string }) {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { password: "", confirmation: "" },
    validationLogic: REVALIDATE_AFTER_SUBMIT,
    validators: { onDynamic: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      setErrorMessage(null);
      const { password } = resetPasswordSchema.parse(value);
      const { error } = await getNelcotaClient().auth.resetPassword({ token, password });
      if (error != null) {
        setErrorMessage(describeAuthError(error, "open_link"));
        return;
      }
      toast.success("Senha alterada.");
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
      <form.Field name="password">
        {(field) => (
          <AuthTextField
            field={field}
            label="Nova senha"
            icon={LockIcon}
            type="password"
            autoComplete="new-password"
            placeholder={`De ${MIN_PASSWORD_LENGTH} a ${MAX_PASSWORD_LENGTH} caracteres`}
          />
        )}
      </form.Field>
      <form.Field name="confirmation">
        {(field) => (
          <AuthTextField
            field={field}
            label="Confirme a nova senha"
            icon={LockIcon}
            type="password"
            autoComplete="new-password"
            placeholder="Digite a senha de novo"
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <AuthSubmitButton label="Salvar nova senha" isSubmitting={isSubmitting} />
        )}
      </form.Subscribe>
    </form>
  );
}
