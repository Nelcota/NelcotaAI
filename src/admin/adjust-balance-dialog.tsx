import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScaleIcon } from "lucide-react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { describeApiError } from "@/shared/api-error";
import { formatCents } from "@/shared/format";
import { getNelcotaClient } from "@/shared/nelcota";
import { TOPUPS_QUERY_KEY } from "@/topups";

import { ADJUST_BALANCE_ERRORS } from "./admin-errors";
import { ADMIN_QUERY_KEY } from "./admin.queries";
import { adjustBalanceSchema } from "./admin.schemas";

/** Manual correction of an organization's balance, with a mandatory description. */
export function AdjustBalanceDialog({ organizationId }: { readonly organizationId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const adjust = useMutation({
    mutationFn: async (adjustment: { signedAmountInCents: number; description: string }) => {
      const { error } = await getNelcotaClient().rpc("admin_adjust_balance", {
        p_organization_id: organizationId,
        p_amount_cents: adjustment.signedAmountInCents,
        p_description: adjustment.description,
      });
      if (error != null) {
        throw error;
      }
      return adjustment.signedAmountInCents;
    },
    onSuccess: async (signedAmountInCents) => {
      setOpen(false);
      form.reset();
      toast.success(`Ajuste de ${formatCents(signedAmountInCents)} registrado.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: TOPUPS_QUERY_KEY }),
      ]);
    },
  });

  const form = useForm({
    defaultValues: { direction: "add" as "add" | "remove", amount: "", description: "" },
    validators: { onSubmit: adjustBalanceSchema },
    onSubmit: ({ value }) => {
      const { direction, amount, description } = adjustBalanceSchema.parse(value);
      adjust.mutate({
        signedAmountInCents: direction === "remove" ? -amount : amount,
        description,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ScaleIcon data-icon="inline-start" />
          Ajustar saldo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeading
          title="Ajustar saldo"
          description="Use para corrigir lançamentos. Recargas pagas devem ser confirmadas pelo pedido."
        />
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            {adjust.error != null && (
              <Alert variant="destructive">
                <AlertDescription>
                  {describeApiError(adjust.error, ADJUST_BALANCE_ERRORS)}
                </AlertDescription>
              </Alert>
            )}
            <form.Field name="direction">
              {(field) => (
                <Field>
                  <FieldLabel id="adjust-direction-label">Tipo de ajuste</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    className="w-full"
                    aria-labelledby="adjust-direction-label"
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (value === "add" || value === "remove") {
                        field.handleChange(value);
                      }
                    }}
                  >
                    <ToggleGroupItem value="add" className="flex-1">
                      Adicionar crédito
                    </ToggleGroupItem>
                    <ToggleGroupItem value="remove" className="flex-1">
                      Remover crédito
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              )}
            </form.Field>
            <form.Field name="amount">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Valor (R$)"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                />
              )}
            </form.Field>
            <form.Field name="description">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Descrição"
                  autoComplete="off"
                  description="Fica registrada no extrato da empresa."
                />
              )}
            </form.Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button className="h-11 rounded-xl px-5" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button className="h-11 rounded-xl px-5" type="submit" disabled={adjust.isPending}>
                {adjust.isPending && <Spinner data-icon="inline-start" />}
                Registrar ajuste
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
