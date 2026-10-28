import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
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

import { ORGANIZATION_ERRORS } from "./admin-errors";
import { ADMIN_QUERY_KEY } from "./admin.queries";
import { organizationFormSchema } from "./admin.schemas";

/** Creates a customer organization and opens its page to link the first login. */
export function NewOrganizationDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: async (organization: { name: string; document: string }) => {
      const { data, error } = await getNelcotaClient()
        .from("organizations")
        .insert(organization)
        .select("id")
        .single();
      if (error != null) {
        throw error;
      }
      return data.id;
    },
    onSuccess: async (organizationId) => {
      setOpen(false);
      toast.success("Empresa criada. Agora vincule o login de quem vai acessar.");
      await queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY });
      await navigate({ to: "/admin/clientes/$organizationId", params: { organizationId } });
    },
  });

  const form = useForm({
    defaultValues: { name: "", document: "" },
    validators: { onSubmit: organizationFormSchema },
    onSubmit: ({ value }) => create.mutate(organizationFormSchema.parse(value)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nova empresa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeading
          title="Nova empresa"
          description="Cadastre o cliente. O login é vinculado em seguida."
        />
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            {create.error != null && (
              <Alert variant="destructive">
                <AlertDescription>
                  {describeApiError(create.error, ORGANIZATION_ERRORS)}
                </AlertDescription>
              </Alert>
            )}
            <form.Field name="name">
              {(field) => (
                <FormTextField field={field} label="Nome da empresa" autoComplete="organization" />
              )}
            </form.Field>
            <form.Field name="document">
              {(field) => (
                <FormTextField
                  field={field}
                  label="CPF ou CNPJ"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="00.000.000/0000-00"
                />
              )}
            </form.Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button className="h-11 rounded-xl px-5" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button className="h-11 rounded-xl px-5" type="submit" disabled={create.isPending}>
                {create.isPending && <Spinner data-icon="inline-start" />}
                Criar empresa
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
