import { cn } from "cn";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

/** Percentage change in green (up) or red (down), with a text alternative for screen readers. */
export function Delta({
  percent,
  comparedTo,
  className,
}: {
  readonly percent: number;
  /** What the change is measured against, read only by screen readers (e.g. "mês anterior"). */
  readonly comparedTo: string;
  readonly className?: string;
}) {
  const isDrop = percent < 0;
  const Icon = isDrop ? ChevronDownIcon : ChevronUpIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        isDrop ? "text-negative" : "text-positive",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{isDrop ? "queda de" : "alta de"}</span>
      {isDrop ? "" : "+"}
      {percent}%<span className="sr-only">em relação ao {comparedTo}</span>
    </span>
  );
}
