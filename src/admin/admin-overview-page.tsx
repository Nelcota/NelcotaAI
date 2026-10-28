import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { KeyStat } from "@/components/key-stat";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInteger } from "@/shared/format";
import {
  type ChartPeriod,
  MonthlyTopupsChart,
  PeriodControl,
  averageOf,
  lastMonthChange,
  monthlyTopupsQuery,
  yearOverYear,
} from "@/topups";

import { platformSummaryQuery } from "./admin.queries";
import { PendingRequests } from "./pending-requests";

const DEFAULT_PERIOD: ChartPeriod = 12;

/** Admin home: platform totals, monthly trend and the queue of requests to confirm. */
export function AdminOverviewPage() {
  const [period, setPeriod] = useState<ChartPeriod>(DEFAULT_PERIOD);
  const summary = useQuery(platformSummaryQuery);
  // RLS lets the admin see every organization, so this is the platform-wide trend.
  const monthly = useQuery(monthlyTopupsQuery(period));

  const periodValues =
    monthly.data == null
      ? null
      : yearOverYear(
          monthly.data.map((row) => ({ month: row.month, value: row.topup_cents })),
          period,
        ).map((point) => point.value);
  const pendingTotal = summary.data?.pending_cents;
  const pendingCount = summary.data?.pending_count ?? null;
  const monthTotal = summary.data?.month_topup_cents;
  const activeCount = summary.data?.active_organization_count;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Administração</h1>
            <Button
              variant="outline"
              className="h-10 rounded-full border-brand/70 dark:border-brand/70 px-5 text-brand hover:bg-primary/10 hover:text-brand"
              asChild
            >
              <Link to="/admin/clientes">Ver clientes</Link>
            </Button>
          </div>
          <dl className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-4">
            <KeyStat
              label="Pedidos pendentes"
              hint={pendingCount == null ? undefined : pluralRequests(pendingCount)}
            >
              <Money cents={pendingTotal ?? null} />
            </KeyStat>
            <KeyStat label="Creditado no mês" changePercent={lastMonthChange(periodValues ?? [])}>
              <Money cents={monthTotal ?? null} />
            </KeyStat>
            <KeyStat label={`Média mensal (${period} meses)`}>
              <Money cents={periodValues == null ? null : averageOf(periodValues)} />
            </KeyStat>
            <KeyStat
              label="Clientes ativos"
              hint={
                summary.data == null
                  ? undefined
                  : `${formatInteger(summary.data.organization_count)} no total`
              }
            >
              {activeCount == null ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <span className="font-semibold tracking-tight tabular-nums">
                  {formatInteger(activeCount)}
                </span>
              )}
            </KeyStat>
          </dl>
        </Panel>
        <Panel>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">Recargas da plataforma</h2>
            <PeriodControl value={period} onChange={setPeriod} />
          </div>
          <MonthlyTopupsChart period={period} />
        </Panel>
      </div>
      <Panel className="flex flex-col gap-5" label="Pedidos aguardando confirmação">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Fila de pedidos</h2>
          {pendingCount != null && pendingCount > 0 && (
            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-brand">
              {pluralRequests(pendingCount)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Confirme depois de conferir o Pix e colocar o crédito na OpenAI.
        </p>
        <PendingRequests />
      </Panel>
    </div>
  );
}

function pluralRequests(count: number): string {
  return `${formatInteger(count)} ${count === 1 ? "pedido" : "pedidos"}`;
}
