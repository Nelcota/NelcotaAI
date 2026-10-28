import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckIcon, InboxIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DialogHeading } from "@/components/dialog-heading";
import { Money } from "@/components/money";
import { QueryErrorAlert } from "@/components/query-error-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { describeApiError } from "@/shared/api-error";
import { formatCents, formatDateTime } from "@/shared/format";
import { getNelcotaClient } from "@/shared/nelcota";
import { TOPUPS_QUERY_KEY } from "@/topups";

import { CANCEL_TOPUP_ERRORS, CONFIRM_TOPUP_ERRORS } from "./admin-errors";
import { ADMIN_QUERY_KEY, pendingRequestsQuery } from "./admin.queries";
import { cancelTopupSchema } from "./admin.schemas";
import { ReceiptLink } from "./receipt-link";

// Same limit as admin_confirm_topup (migration V7).
const MAX_REFERENCE_LENGTH = 120;

interface PendingRequest {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly amountInCents: number;
}

/** Queue of top-up requests waiting for the admin, oldest first. */
export function PendingRequests() {
  const pending = useQuery(pendingRequestsQuery);

  if (pending.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (pending.isError) {
    return <QueryErrorAlert onRetry={() => void pending.refetch()} />;
  }
  if (pending.data.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>Nenhum pedido pendente</EmptyTitle>
          <EmptyDescription>
            Novos pedidos de recarga aparecem aqui automaticamente.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col divide-y">
      {pending.data.map((row) => {
        const request: PendingRequest = {
          id: row.id,
          organizationId: row.organization_id,
          organizationName: row.organization?.name ?? "Empresa removida",
          amountInCents: row.amount_cents,
        };
        return (
          <li key={row.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to="/admin/clientes/$organizationId"
                  params={{ organizationId: row.organization_id }}
                  className="block truncate font-medium hover:underline"
                >
                  {request.organizationName}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  Pedido em {formatDateTime(row.created_at)}
                </p>
                {row.receipt_path == null ? (
                  <p className="text-xs text-muted-foreground">Sem comprovante</p>
                ) : (
                  <ReceiptLink path={row.receipt_path} />
                )}
              </div>
              <Money cents={row.amount_cents} className="text-base" />
            </div>
            <div className="flex gap-2">
              <CancelTopupDialog request={request} />
              <ConfirmTopupDialog request={request} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function useInvalidateAfterDecision() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: TOPUPS_QUERY_KEY }),
    ]);
  };
}

function ConfirmTopupDialog({ request }: { readonly request: PendingRequest }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const invalidate = useInvalidateAfterDecision();
  const referenceId = `payment-reference-${request.id}`;
  const confirm = useMutation({
    mutationFn: async () => {
      const trimmed = reference.trim();
      const { data, error } = await getNelcotaClient().rpc("admin_confirm_topup", {
        p_request_id: request.id,
        ...(trimmed === "" ? {} : { p_payment_reference: trimmed }),
      });
      if (error != null) {
        throw error;
      }
      return data;
    },
    onSuccess: async (credited) => {
      setOpen(false);
      toast.success(
        credited === true
          ? `Recarga de ${formatCents(request.amountInCents)} creditada.`
          : "Este pedido já estava confirmado.",
      );
      await invalidate();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1 rounded-full">
          <CheckIcon data-icon="inline-start" />
          Confirmar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeading
          title="Confirmar recarga"
          description={`${request.organizationName}: ${formatCents(request.amountInCents)}`}
        />
        <p className="text-sm text-muted-foreground">
          Confirme só depois de conferir o Pix e colocar o crédito na OpenAI. O cliente passa a ver
          esta recarga como creditada, e o lançamento não pode ser desfeito (apenas corrigido com um
          ajuste).
        </p>
        <Field>
          <FieldLabel htmlFor={referenceId}>Referência do pagamento (opcional)</FieldLabel>
          <Input
            id={referenceId}
            value={reference}
            maxLength={MAX_REFERENCE_LENGTH}
            autoComplete="off"
            placeholder="Ex.: ID da transação no Mercado Pago"
            aria-describedby={`${referenceId}-hint`}
            onChange={(event) => setReference(event.target.value)}
          />
          <FieldDescription id={`${referenceId}-hint`}>
            Ajuda na conciliação e impede confirmar o mesmo Pix duas vezes.
          </FieldDescription>
        </Field>
        {confirm.error != null && (
          <Alert variant="destructive">
            <AlertDescription>
              {describeApiError(confirm.error, CONFIRM_TOPUP_ERRORS)}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button className="h-11 rounded-xl px-5" variant="outline">
              Voltar
            </Button>
          </DialogClose>
          <Button
            className="h-11 rounded-xl px-5"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            {confirm.isPending && <Spinner data-icon="inline-start" />}
            Confirmar recarga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelTopupDialog({ request }: { readonly request: PendingRequest }) {
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidateAfterDecision();
  const cancel = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await getNelcotaClient().rpc("admin_cancel_topup", {
        p_request_id: request.id,
        p_reason: reason,
      });
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success("Pedido recusado.");
      await invalidate();
    },
  });

  const form = useForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: cancelTopupSchema },
    onSubmit: ({ value }) => cancel.mutate(cancelTopupSchema.parse(value).reason),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="flex-1 rounded-full">
          <XIcon data-icon="inline-start" />
          Recusar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeading
          title="Recusar pedido"
          description={`${request.organizationName}: ${formatCents(request.amountInCents)}`}
        />
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            {cancel.error != null && (
              <Alert variant="destructive">
                <AlertDescription>
                  {describeApiError(cancel.error, CANCEL_TOPUP_ERRORS)}
                </AlertDescription>
              </Alert>
            )}
            <form.Field name="reason">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && field.state.meta.isValid === false;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={`cancel-reason-${request.id}`}>
                      Motivo (o cliente verá)
                    </FieldLabel>
                    <Textarea
                      id={`cancel-reason-${request.id}`}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                      aria-describedby={isInvalid ? `cancel-reason-${request.id}-error` : undefined}
                    />
                    {isInvalid && (
                      <FieldError
                        id={`cancel-reason-${request.id}-error`}
                        errors={field.state.meta.errors}
                      />
                    )}
                  </Field>
                );
              }}
            </form.Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button className="h-11 rounded-xl px-5" variant="outline">
                  Voltar
                </Button>
              </DialogClose>
              <Button
                className="h-11 rounded-xl px-5"
                type="submit"
                variant="destructive"
                disabled={cancel.isPending}
              >
                {cancel.isPending && <Spinner data-icon="inline-start" />}
                Recusar pedido
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
