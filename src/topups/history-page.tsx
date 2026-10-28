import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { DownloadIcon, ReceiptIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { KeyStat } from "@/components/key-stat";
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
import { toSaoPauloCalendarDate } from "@/shared/dates";
import { formatDate, formatInteger, formatRequestCount } from "@/shared/format";

import { RequestTopupDialog } from "./checkout/request-topup-dialog";
import { RequestList } from "./history/request-list";
import { requestsToCsv } from "./history/requests-csv";
import {
  organizationBalanceQuery,
  pendingTopupRequestsQuery,
  topupHistoryQuery,
} from "./topups.queries";
import { type HistoryFilter, fetchRequestsForExport } from "./topups.repository";

const FILTER_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Aguardando" },
  { value: "confirmed", label: "Creditadas" },
  { value: "cancelled", label: "Recusadas" },
  { value: "withdrawn", label: "Canceladas" },
] as const satisfies readonly { value: HistoryFilter; label: string }[];

const EMPTY_MESSAGES = {
  all: 'Use "Nova recarga" para pedir créditos. O pagamento é por Pix ou cartão.',
  pending: "Nenhum pedido aguardando pagamento ou confirmação.",
  confirmed: "Nenhuma recarga creditada ainda.",
  cancelled: "Nenhum pedido recusado.",
  withdrawn: "Nenhum pedido cancelado por você.",
} as const satisfies Record<HistoryFilter, string>;

interface TopupHistoryPageProps {
  readonly organizationId: string;
  readonly isOrganizationBlocked: boolean;
}

/** Every top-up request of the organization: summary, filters, monthly groups and export. */
export function TopupHistoryPage({ organizationId, isOrganizationBlocked }: TopupHistoryPageProps) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const history = useInfiniteQuery(topupHistoryQuery(organizationId, filter));
  const requests = history.data?.pages.flat() ?? [];

  return (
    <>
      <PageHeader
        title="Recargas"
        description="Acompanhe seus pedidos, pague os pendentes e baixe o histórico."
        actions={
          <>
            <ExportButton organizationId={organizationId} filter={filter} />
            {isOrganizationBlocked ? null : <RequestTopupDialog />}
          </>
        }
      />
      <SummaryPanel organizationId={organizationId} />
      <Panel className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Histórico</h2>
          <div className="max-w-full overflow-x-auto">
            <SegmentedControl
              label="Filtrar por situação"
              options={FILTER_OPTIONS}
              value={filter}
              onChange={setFilter}
            />
          </div>
        </div>
        {history.isPending && <Skeleton className="h-64 w-full rounded-2xl" />}
        {history.isError && <QueryErrorAlert onRetry={() => void history.refetch()} />}
        {history.isSuccess && requests.length === 0 && (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ReceiptIcon />
              </EmptyMedia>
              <EmptyTitle>Nada por aqui</EmptyTitle>
              <EmptyDescription>{EMPTY_MESSAGES[filter]}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {requests.length > 0 && <RequestList organizationId={organizationId} requests={requests} />}
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

function SummaryPanel({ organizationId }: { readonly organizationId: string }) {
  const balance = useQuery(organizationBalanceQuery(organizationId));
  const pending = useQuery(pendingTopupRequestsQuery(organizationId));
  const lastCredit = balance.data?.last_credit_cents ?? null;
  const lastCreditAt = balance.data?.last_credit_at ?? null;
  const pendingTotal = pending.data?.reduce((total, request) => total + request.amount_cents, 0);
  const pendingCount = pending.data?.length;

  return (
    <Panel label="Resumo das recargas">
      <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-4">
        <KeyStat label="Saldo creditado">
          <Money cents={balance.data?.balance_cents ?? null} />
        </KeyStat>
        <KeyStat
          label="Aguardando confirmação"
          hint={pendingCount == null ? undefined : formatRequestCount(pendingCount)}
        >
          <Money cents={pendingTotal ?? null} />
        </KeyStat>
        <KeyStat label="Recargas creditadas">
          {balance.data == null ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className="font-semibold tracking-tight tabular-nums">
              {formatInteger(balance.data.credited_count)}
            </span>
          )}
        </KeyStat>
        <KeyStat
          label="Última recarga creditada"
          hint={lastCreditAt == null ? undefined : `em ${formatDate(lastCreditAt)}`}
        >
          {balance.isSuccess && lastCredit == null ? (
            <span className="font-semibold">—</span>
          ) : (
            <Money cents={lastCredit} />
          )}
        </KeyStat>
      </dl>
    </Panel>
  );
}

function ExportButton({
  organizationId,
  filter,
}: {
  readonly organizationId: string;
  readonly filter: HistoryFilter;
}) {
  const exportCsv = useMutation({
    mutationFn: async () => {
      const requests = await fetchRequestsForExport(organizationId, filter);
      downloadText(
        requestsToCsv(requests),
        `recargas-${toSaoPauloCalendarDate(new Date())}.csv`,
        "text/csv;charset=utf-8",
      );
      return requests.length;
    },
    onSuccess: (count) => toast.success(`${formatRequestCount(count)} exportados.`),
    onError: (error) => {
      console.warn("export failed", error);
      toast.error("Não foi possível exportar agora. Tente de novo.");
    },
  });

  return (
    <Button
      variant="outline"
      className="h-10 rounded-full border-white/30 bg-black/20 px-5 text-white backdrop-blur hover:bg-black/30 hover:text-white dark:border-white/30"
      disabled={exportCsv.isPending}
      onClick={() => exportCsv.mutate()}
    >
      {exportCsv.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <DownloadIcon data-icon="inline-start" />
      )}
      Exportar CSV
    </Button>
  );
}

function downloadText(content: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
