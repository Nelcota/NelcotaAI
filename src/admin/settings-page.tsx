import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FormTextField } from "@/components/form-text-field";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { QueryErrorAlert } from "@/components/query-error-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { describeApiError } from "@/shared/api-error";
import { centsToBrlInput } from "@/shared/money";
import { getNelcotaClient } from "@/shared/nelcota";
import { pixSettingsQuery } from "@/topups";

import { SETTINGS_ERRORS } from "./admin-errors";
import { settingsFormSchema } from "./admin.schemas";

/** Pix receiving data shown to customers and the accepted top-up range. */
export function SettingsPage() {
  const settings = useQuery(pixSettingsQuery);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Dados de pagamento que os clientes veem ao pedir uma recarga."
      />
      <Panel className="max-w-2xl">
        {settings.isPending && <Skeleton className="h-80 w-full" />}
        {settings.isError && <QueryErrorAlert onRetry={() => void settings.refetch()} />}
        {settings.isSuccess && (
          <SettingsForm
            initialValues={{
              pixKey: settings.data.pix_key ?? "",
              pixReceiverName: settings.data.pix_receiver_name ?? "",
              pixCity: settings.data.pix_city ?? "",
              minimum: centsToBrlInput(settings.data.minimum_topup_cents),
              maximum: centsToBrlInput(settings.data.maximum_topup_cents),
            }}
          />
        )}
      </Panel>
    </>
  );
}

interface SettingsFormValues {
  pixKey: string;
  pixReceiverName: string;
  pixCity: string;
  minimum: string;
  maximum: string;
}

function SettingsForm({ initialValues }: { readonly initialValues: SettingsFormValues }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (values: {
      pixKey: string;
      pixReceiverName: string;
      pixCity: string;
      minimum: number;
      maximum: number;
    }) => {
      const { error } = await getNelcotaClient()
        .from("settings")
        .update({
          pix_key: values.pixKey,
          pix_receiver_name: values.pixReceiverName,
          pix_city: values.pixCity,
          minimum_topup_cents: values.minimum,
          maximum_topup_cents: values.maximum,
        })
        .eq("id", true);
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Configurações salvas.");
      await queryClient.invalidateQueries({ queryKey: pixSettingsQuery.queryKey });
    },
  });

  const form = useForm({
    defaultValues: initialValues,
    validators: { onSubmit: settingsFormSchema },
    onSubmit: ({ value }) => save.mutate(settingsFormSchema.parse(value)),
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
            <AlertDescription>{describeApiError(save.error, SETTINGS_ERRORS)}</AlertDescription>
          </Alert>
        )}
        <FieldSet>
          <FieldLegend>Recebimento por Pix</FieldLegend>
          <FieldGroup>
            <form.Field name="pixKey">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Chave Pix"
                  autoComplete="off"
                  description="Chave da conta que recebe os pagamentos (ex.: Mercado Pago)."
                />
              )}
            </form.Field>
            <form.Field name="pixReceiverName">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Favorecido"
                  autoComplete="off"
                  description="Nome que aparece para o cliente ao pagar."
                />
              )}
            </form.Field>
            <form.Field name="pixCity">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Cidade do favorecido"
                  autoComplete="off"
                  description="Exigida pelo Pix copia e cola. Até 15 caracteres, ex.: SAO PAULO."
                />
              )}
            </form.Field>
          </FieldGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend>Limites de recarga</FieldLegend>
          <FieldGroup className="grid sm:grid-cols-2">
            <form.Field name="minimum">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Mínimo (R$)"
                  inputMode="decimal"
                  autoComplete="off"
                />
              )}
            </form.Field>
            <form.Field name="maximum">
              {(field) => (
                <FormTextField
                  field={field}
                  label="Máximo (R$)"
                  inputMode="decimal"
                  autoComplete="off"
                />
              )}
            </form.Field>
          </FieldGroup>
        </FieldSet>
        <Button
          type="submit"
          className="h-10 self-start rounded-full px-5"
          disabled={save.isPending}
        >
          {save.isPending && <Spinner data-icon="inline-start" />}
          Salvar configurações
        </Button>
      </FieldGroup>
    </form>
  );
}
