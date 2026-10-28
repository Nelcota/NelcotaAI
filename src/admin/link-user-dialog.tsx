import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DialogHeading } from "@/components/dialog-heading";
import { FormTextField } from "@/components/form-text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { describeApiError } from "@/shared/api-error";
import { getNelcotaClient } from "@/shared/nelcota";

import { LINK_USER_ERRORS } from "./admin-errors";
import { ADMIN_QUERY_KEY } from "./admin.queries";
import { linkUserSchema } from "./admin.schemas";

/**
 * Links a login to the organization. Nelcota has no API to create accounts, so the login is
 * created first in the Nelcota panel (Users) and linked here by e-mail.
 */
export function LinkUserDialog({ organizationId }: { readonly organizationId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const link = useMutation({
    mutationFn: async (person: { email: string; name: string }) => {
      const { error } = await getNelcotaClient().rpc("admin_link_user", {
        p_email: person.email,
        p_organization_id: organizationId,
        p_name: person.name,
      });
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success("Login vinculado. A pessoa já pode entrar no painel.");
      await queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY });
    },
  });

  const form = useForm({
    defaultValues: { email: "", name: "" },
    validators: { onSubmit: linkUserSchema },
    onSubmit: ({ value }) => link.mutate(linkUserSchema.parse(value)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlusIcon data-icon="inline-start" />
          Vincular login
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeading
          title="Vincular login"
          description="Crie o login no painel do Nelcota (Usuários) e informe aqui o mesmo e-mail."
        />
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            {link.error != null && (
              <Alert variant="destructive">
                <AlertDescription>
                  {describeApiError(link.error, LINK_USER_ERRORS)}
                </AlertDescription>
              </Alert>
            )}
            <form.Field name="email">
              {(field) => (
                <FormTextField
                  field={field}
                  label="E-mail da conta"
                  type="email"
                  autoComplete="off"
                />
              )}
            </form.Field>
            <form.Field name="name">
              {(field) => <FormTextField field={field} label="Nome da pessoa" autoComplete="off" />}
            </form.Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button className="h-11 rounded-xl px-5" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button className="h-11 rounded-xl px-5" type="submit" disabled={link.isPending}>
                {link.isPending && <Spinner data-icon="inline-start" />}
                Vincular
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
