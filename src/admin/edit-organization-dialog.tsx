import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
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
import { formatDocument } from "@/shared/format";
import { getNelcotaClient } from "@/shared/nelcota";

import { ORGANIZATION_ERRORS } from "./admin-errors";
import { ADMIN_QUERY_KEY } from "./admin.queries";
import { organizationFormSchema } from "./admin.schemas";

interface EditOrganizationDialogProps {
  readonly organizationId: string;
  readonly name: string;
  /** CPF or CNPJ, digits only, as stored. */
  readonly document: string;
}

/** Changes the name or the CPF/CNPJ of a customer organization. */
export function EditOrganizationDialog({
  organizationId,
  name,
  document,
}: EditOrganizationDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilIcon data-icon="inline-start" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeading
          title="Editar empresa"
          description="O histórico de recargas e o saldo continuam os mesmos."
        />
        {/* Mounted per opening, so the fields always start from the current values. */}
        <EditOrganizationForm
          organizationId={organizationId}
          name={name}
          document={document}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface EditOrganizationFormProps extends EditOrganizationDialogProps {
  readonly onSaved: () => void;
}

function EditOrganizationForm({
  organizationId,
  name,
  document,
  onSaved,
}: EditOrganizationFormProps) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: async (organization: { name: string; document: string }) => {
      const { error } = await getNelcotaClient()
        .from("organizations")
        .update(organization)
        .eq("id", organizationId);
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      onSaved();
      toast.success("Dados da empresa atualizados.");
      await queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY });
    },
  });

  const form = useForm({
    defaultValues: { name, document: formatDocument(document) },
    validators: { onSubmit: organizationFormSchema },
    onSubmit: ({ value }) => save.mutate(organizationFormSchema.parse(value)),
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        {save.error != null && (
          <Alert variant="destructive">
            <AlertDescription>{describeApiError(save.error, ORGANIZATION_ERRORS)}</AlertDescription>
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
          <Button className="h-11 rounded-xl px-5" type="submit" disabled={save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" />}
            Salvar
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}
