import { useId } from "react";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";

import { changePercent } from "./change-percent";
import { Delta } from "./delta";
import { Money } from "./money";

/** One point: `key` labels the axis, `value` is the main line, `comparison` the faint one. */
interface GlowPoint {
  readonly key: string;
  readonly value: number;
  readonly comparison?: number | undefined;
}

interface GlowLineChartProps {
  readonly data: readonly GlowPoint[];
  /** Accessible description of what the chart shows. */
  readonly label: string;
  readonly formatKey: (key: string) => string;
  readonly formatAxisValue: (value: number) => string;
  /** Names the faint line in the tooltip, such as "Ano anterior". */
  readonly comparisonLabel: string;
  readonly className?: string;
}

const MAIN_STROKE_WIDTH = 3;
const COMPARISON_STROKE_WIDTH = 1.5;
const COMPARISON_OPACITY = 0.45;
const GLOW_BLUR = 7;
const ACTIVE_DOT_RADIUS = 6;
const Y_AXIS_WIDTH = 72;
const Y_AXIS_TICKS = 5;

const chartConfig = {
  value: { color: "var(--chart-2)" },
  comparison: { color: "var(--muted-foreground)" },
} satisfies ChartConfig;

/**
 * Smooth line with a pink-to-orange gradient and a soft glow over a faint comparison line.
 * The tooltip shows the value, its change against the comparison and the comparison itself.
 */
export function GlowLineChart({
  data,
  label,
  formatKey,
  formatAxisValue,
  comparisonLabel,
  className,
}: GlowLineChartProps) {
  const id = useId().replaceAll(":", "");
  const strokeId = `glow-stroke-${id}`;
  const fillId = `glow-fill-${id}`;
  const glowId = `glow-blur-${id}`;
  const hasComparison = data.some((point) => point.comparison != null);
  // A gradient stroke on a perfectly flat line has a zero-height box and would not render.
  const isFlat = data.every((point) => point.value === data[0]?.value);

  return (
    <ChartContainer config={chartConfig} className={className} role="img" aria-label={label}>
      <ComposedChart data={[...data]} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--chart-1)" />
            <stop offset="100%" stopColor="var(--chart-2)" />
          </linearGradient>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <filter id={glowId} x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation={GLOW_BLUR} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid vertical horizontal className="[&_line]:stroke-border" />
        <XAxis
          dataKey="key"
          tickLine={false}
          axisLine={false}
          tickMargin={14}
          minTickGap={12}
          tickFormatter={(key: unknown) => (typeof key === "string" ? formatKey(key) : "")}
        />
        <YAxis
          width={Y_AXIS_WIDTH}
          tickLine={false}
          axisLine={false}
          tickCount={Y_AXIS_TICKS}
          tickFormatter={(value: unknown) =>
            typeof value === "number" ? formatAxisValue(value) : ""
          }
        />
        <ChartTooltip
          cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.6, strokeWidth: 1 }}
          content={<GlowTooltip formatKey={formatKey} comparisonLabel={comparisonLabel} />}
        />
        <Area dataKey="value" type="monotone" stroke="none" fill={`url(#${fillId})`} />
        {hasComparison && (
          <Line
            dataKey="comparison"
            type="monotone"
            stroke="var(--color-comparison)"
            strokeOpacity={COMPARISON_OPACITY}
            strokeWidth={COMPARISON_STROKE_WIDTH}
            dot={false}
            activeDot={false}
          />
        )}
        <Line
          dataKey="value"
          type="monotone"
          stroke={isFlat ? "var(--chart-2)" : `url(#${strokeId})`}
          strokeWidth={MAIN_STROKE_WIDTH}
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          dot={false}
          activeDot={{
            r: ACTIVE_DOT_RADIUS,
            fill: "#ffffff",
            stroke: "var(--card)",
            strokeWidth: 3,
          }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

interface TooltipEntry {
  readonly dataKey?: unknown;
  readonly value?: unknown;
}

interface GlowTooltipProps {
  readonly formatKey: (key: string) => string;
  readonly comparisonLabel: string;
  readonly active?: boolean;
  readonly payload?: readonly TooltipEntry[];
  readonly label?: unknown;
}

function GlowTooltip({ formatKey, comparisonLabel, active, payload, label }: GlowTooltipProps) {
  if (active !== true || payload == null || payload.length === 0) {
    return null;
  }
  const value = numberOf(payload, "value");
  const comparison = numberOf(payload, "comparison");
  if (value == null) {
    return null;
  }
  const change = changePercent(value, comparison);

  return (
    <div className="flex min-w-48 items-center gap-3 rounded-2xl border bg-popover/95 p-3 shadow-xl backdrop-blur">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15"
      >
        <span className="size-3.5 rounded-full border-[2.5px] border-brand" />
      </span>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <Money cents={value} className="text-base" />
          {change != null && <Delta percent={change} comparedTo={comparisonLabel} />}
        </div>
        <p className="text-xs text-muted-foreground">
          {typeof label === "string" ? formatKey(label) : ""}
          {comparison != null && ` · ${comparisonLabel}: `}
          {comparison != null && <Money cents={comparison} className="inline-flex text-xs" />}
        </p>
      </div>
    </div>
  );
}

function numberOf(payload: readonly TooltipEntry[], key: string): number | null {
  const entry = payload.find((candidate) => candidate.dataKey === key);
  return typeof entry?.value === "number" ? entry.value : null;
}
