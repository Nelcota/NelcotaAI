import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Delta } from "@/components/delta";
import { InitialAvatar } from "@/components/initial-avatar";
import { KeyStat } from "@/components/key-stat";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { QueryErrorAlert } from "@/components/query-error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatRequestCount } from "@/shared/format";

import { RequestTopupDialog } from "./checkout/request-topup-dialog";
import { CompanyPanel } from "./overview/company-panel";
import { MonthlyTopupsChart, PeriodControl } from "./overview/topups-chart";
import { averageOf, lastMonthChange, yearOverYear } from "./overview/trend";
import {
  type ChartPeriod,
  monthlyTopupsQuery,
  organizationBalanceQuery,
  pendingTopupRequestsQuery,
} from "./topups.queries";

const DEFAULT_PERIOD: ChartPeriod = 12;

interface TopupOverviewPageProps {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationDocument: string;
  readonly isOrganizationBlocked: boolean;
}

/** The customer's home: credits at a glance, the monthly trend and the company card. */
export function TopupOverviewPage({
  organizationId,
  organizationName,
  organizationDocument,
  isOrganizationBlocked,
}: TopupOverviewPageProps) {
  const [period, setPeriod] = useState<ChartPeriod>(DEFAULT_PERIOD);
  const balance = useQuery(organizationBalanceQuery(organizationId));
  const monthly = useQuery(monthlyTopupsQuery(period));
  const pending = useQuery(pendingTopupRequestsQuery(organizationId));

  const periodValues =
    monthly.data == null
      ? null
      : yearOverYear(
          monthly.data.map((row) => ({ month: row.month, value: row.topup_cents })),
          period,
        ).map((point) => point.value);
  const monthChange = lastMonthChange(periodValues ?? []);
  const pendingTotal = pending.data?.reduce((total, request) => total + request.amount_cents, 0);
  const pendingCount = pending.data?.length ?? null;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {isOrganizationBlocked && (
          <Alert variant="destructive">
            <AlertTitle>Sua empresa está bloqueada.</AlertTitle>
            <AlertDescription>Novas recargas estão suspensas. Fale com o suporte.</AlertDescription>
          </Alert>
        )}
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Seus créditos</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-10 rounded-full border-brand/70 dark:border-brand/70 px-5 text-brand hover:bg-primary/10 hover:text-brand"
                asChild
              >
                <Link to="/como-funciona">Como funciona</Link>
              </Button>
              {isOrganizationBlocked === false && <RequestTopupDialog />}
            </div>
          </div>
          {balance.isError ? (
            <div className="mt-6">
              <QueryErrorAlert onRetry={() => void balance.refetch()} />
            </div>
          ) : (
            <dl className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-4">
              <KeyStat label="Saldo creditado">
                <Money cents={balance.data?.balance_cents ?? null} />
              </KeyStat>
              <KeyStat label="Creditado no mês" changePercent={monthChange}>
                <Money cents={balance.data?.month_topup_cents ?? null} />
              </KeyStat>
              <KeyStat label={`Média mensal (${period} meses)`}>
                <Money cents={periodValues == null ? null : averageOf(periodValues)} />
              </KeyStat>
              <KeyStat
                label="Aguardando confirmação"
                hint={pendingCount == null ? undefined : formatRequestCount(pendingCount)}
              >
                <Money cents={pendingTotal ?? null} />
              </KeyStat>
            </dl>
          )}
        </Panel>
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">Recargas ao longo do tempo</h2>
            <PeriodControl value={period} onChange={setPeriod} />
          </div>
          <div className="mt-5 mb-6 flex items-center gap-3">
            <InitialAvatar
              name={organizationName}
              className="size-11 rounded-2xl text-sm font-bold"
            />
            <div>
              <p className="text-sm text-muted-foreground">{organizationName} · creditado no mês</p>
              <div className="flex items-center gap-2">
                <Money cents={balance.data?.month_topup_cents ?? null} className="text-lg" />
                {monthChange != null && <Delta percent={monthChange} comparedTo="mês anterior" />}
              </div>
            </div>
          </div>
          <MonthlyTopupsChart period={period} />
        </Panel>
      </div>
      <CompanyPanel
        organizationId={organizationId}
        organizationName={organizationName}
        organizationDocument={organizationDocument}
        isOrganizationBlocked={isOrganizationBlocked}
        pendingCount={pendingCount}
        action={isOrganizationBlocked === false ? <RequestTopupDialog trigger="outline" /> : null}
      />
    </div>
  );
}
