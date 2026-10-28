import { useQuery } from "@tanstack/react-query";

import { GlowLineChart } from "@/components/glow-line-chart";
import { QueryErrorAlert } from "@/components/query-error-alert";
import { SegmentedControl } from "@/components/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactCents, formatShortMonth } from "@/shared/format";

import { CHART_PERIODS, type ChartPeriod, monthlyTopupsQuery } from "./topups.queries";
import { yearOverYear } from "./trend";

const PERIOD_OPTIONS = [
  { value: "3", label: "3M" },
  { value: "6", label: "6M" },
  { value: "12", label: "1A" },
] as const satisfies readonly { value: `${ChartPeriod}`; label: string }[];

/** The 3M / 6M / 1A pill switch of the chart. */
export function PeriodControl({
  value,
  onChange,
}: {
  readonly value: ChartPeriod;
  readonly onChange: (period: ChartPeriod) => void;
}) {
  return (
    <SegmentedControl
      label="Período do gráfico"
      options={PERIOD_OPTIONS}
      value={`${value}`}
      onChange={(next) => {
        const period = CHART_PERIODS.find((candidate) => `${candidate}` === next);
        if (period != null) {
          onChange(period);
        }
      }}
    />
  );
}

/**
 * Glowing line of the amount credited per month in the chosen period, over a faint line for
 * the same months one year earlier.
 */
export function MonthlyTopupsChart({ period }: { readonly period: ChartPeriod }) {
  const monthly = useQuery(monthlyTopupsQuery(period));

  if (monthly.isPending) {
    return <Skeleton className="h-80 w-full rounded-2xl" />;
  }
  if (monthly.isError) {
    return <QueryErrorAlert onRetry={() => void monthly.refetch()} />;
  }
  const points = yearOverYear(
    monthly.data.map((row) => ({ month: row.month, value: row.topup_cents })),
    period,
  );

  return (
    <div className="flex flex-col gap-4">
      <GlowLineChart
        className="h-80 w-full"
        label={`Gráfico de linha com o valor creditado em cada um dos últimos ${period} meses, comparado ao mesmo período do ano anterior`}
        data={points.map((point) => ({
          key: point.month,
          value: point.value,
          comparison: point.previousYearValue,
        }))}
        comparisonLabel="ano anterior"
        formatKey={formatShortMonth}
        formatAxisValue={formatCompactCents}
      />
      <ul aria-label="Legenda" className="flex flex-wrap gap-5 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-1 w-5 rounded-full bg-linear-to-r from-chart-1 to-chart-2"
          />
          Período atual
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-muted-foreground/50" />
          Mesmo período do ano anterior
        </li>
      </ul>
    </div>
  );
}
