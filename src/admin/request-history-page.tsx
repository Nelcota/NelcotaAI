import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { useState } from "react";

import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { QueryErrorAlert } from "@/components/query-error-alert";
import { SegmentedControl } from "@/components/segmented-control";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/shared/format";
import { TopupStatusBadge } from "@/topups";

import { type RequestHistoryFilter, requestHistoryQuery } from "./admin.queries";
import { ReceiptLink } from "./receipt-link";

const PAYMENT_METHOD_LABELS = {
  manual_pix: "Pix manual",
  pix: "Pix (Mercado Pago)",
  card: "Cartão (Mercado Pago)",
} as const;

// Statuses that change money after the credit was given; the ledger is not touched
// automatically, so the admin must review them (and adjust the balance if needed).
const PROVIDER_ALERTS: ReadonlyMap<string, string> = new Map([
  ["refunded", "Estornado no Mercado Pago: revise o saldo do cliente."],
  ["charged_back", "Contestado pelo titular do cartão (chargeback): revise o saldo do cliente."],
]);

const FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "confirmed", label: "Creditados" },
  { value: "cancelled", label: "Recusados" },
  { value: "withdrawn", label: "Cancelados" },
] as const satisfies readonly { value: RequestHistoryFilter; label: string }[];

/** Every top-up request of the platform, with status filter, reference and receipt. */
export function RequestHistoryPage() {
  const [filter, setFilter] = useState<RequestHistoryFilter>("all");
  const history = useInfiniteQuery(requestHistoryQuery(filter));
  const requests = history.data?.pages.flat() ?? [];

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Todos os pedidos de recarga, com referência de pagamento e comprovante."
      />
      <Panel className="flex flex-col gap-5">
        <div className="overflow-x-auto">
          <SegmentedControl
            label="Filtrar por situação"
            options={FILTER_OPTIONS}
            value={filter}
            onChange={setFilter}
          />
        </div>
        {history.isPending && <Skeleton className="h-64 w-full" />}
        {history.isError && <QueryErrorAlert onRetry={() => void history.refetch()} />}
        {history.isSuccess && requests.length === 0 && (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>Nenhum pedido</EmptyTitle>
              <EmptyDescription>Não há pedidos com esta situação.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {requests.length > 0 && (
          <ul className="flex flex-col divide-y">
            {requests.map((request) => (
              <li
                key={request.id}
                className="grid gap-x-4 gap-y-1 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <Link
                    to="/admin/clientes/$organizationId"
                    params={{ organizationId: request.organization_id }}
                    className="block truncate font-medium hover:underline"
                  >
                    {request.organization?.name ?? "Empresa removida"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Pedido em {formatDateTime(request.created_at)} ·{" "}
                    {PAYMENT_METHOD_LABELS[request.payment_method]}
                    {request.payment_reference != null && ` · Ref.: ${request.payment_reference}`}
                    {request.provider_payment_id != null &&
                      ` · Mercado Pago #${request.provider_payment_id}`}
                  </p>
                  {request.provider_status != null &&
                    PROVIDER_ALERTS.has(request.provider_status) && (
                      <p className="text-xs font-medium text-negative">
                        {PROVIDER_ALERTS.get(request.provider_status)}
                      </p>
                    )}
                  {request.cancel_reason != null && (
                    <p className="truncate text-xs text-muted-foreground">
                      Motivo: {request.cancel_reason}
                    </p>
                  )}
                  {request.receipt_path != null && <ReceiptLink path={request.receipt_path} />}
                </div>
                <TopupStatusBadge status={request.status} />
                <Money cents={request.amount_cents} className="text-base sm:justify-self-end" />
              </li>
            ))}
          </ul>
        )}
        {history.hasNextPage && (
          <Button
            variant="outline"
            className="self-center rounded-full"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {history.isFetchingNextPage && <Spinner data-icon="inline-start" />}
            Carregar mais
          </Button>
        )}
      </Panel>
    </>
  );
}
