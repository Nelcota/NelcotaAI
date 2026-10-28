import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { DialogHeading } from "@/components/dialog-heading";
import { FormTextField } from "@/components/form-text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { getNelcotaClient } from "@/shared/nelcota";

import { describePasswordChangeError } from "./auth-error";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, changePasswordSchema } from "./auth.schemas";

interface ChangePasswordDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Changes the signed-in user's password. Nelcota ends the user's other sessions; this one keeps
 * working.
 */
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const change = useMutation({
    mutationFn: async (input: { currentPassword: string; password: string }) => {
      const { error } = await getNelcotaClient().auth.updateUser(input);
      if (error != null) {
        throw error;
      }
    },
    onSuccess: () => {
      onOpenChange(false);
      form.reset();
      toast.success("Senha alterada. Outros aparelhos precisarão entrar de novo.");
    },
  });

  const form = useForm({
    defaultValues: { currentPassword: "", password: "", confirmation: "" },
    validators: { onSubmit: changePasswordSchema },
    onSubmit: ({ value }) => {
      const { currentPassword, password } = changePasswordSchema.parse(value);
      change.mutate({ currentPassword, password });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next === false) {
          form.reset();
          change.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeading
          title="Alterar senha"
          description={`Use de ${MIN_PASSWORD_LENGTH} a ${MAX_PASSWORD_LENGTH} caracteres. Os outros aparelhos precisarão entrar de novo.`}
        />
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            {change.error != null && (
              <Alert variant="destructive">
                <AlertDescription>{describePasswordChangeError(change.error)}</AlertDescription>
              </Alert>
            )}
            <form.Field name="currentPassword">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Senha atual"
                  type="password"
                  autoComplete="current-password"
                />
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Nova senha"
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </form.Field>
            <form.Field name="confirmation">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Confirme a nova senha"
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </form.Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button className="h-11 rounded-xl px-5" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button className="h-11 rounded-xl px-5" type="submit" disabled={change.isPending}>
                {change.isPending && <Spinner data-icon="inline-start" />}
                Salvar nova senha
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
