import { cn } from "cn";

import { Skeleton } from "@/components/ui/skeleton";
import { formatCentsParts } from "@/shared/format";

interface MoneyProps {
  /** Integer amount in cents, or null while it loads. */
  readonly cents: number | null;
  readonly className?: string;
}

/** An amount in BRL with the currency symbol half the size of the digits; a skeleton while it loads. */
export function Money({ cents, className }: MoneyProps) {
  if (cents == null) {
    return <Skeleton className="h-8 w-36" />;
  }
  const { symbol, amount } = formatCentsParts(cents);
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 font-semibold tracking-tight tabular-nums",
        className,
      )}
    >
      <span className="text-[0.5em] font-medium text-muted-foreground">{symbol}</span>
      {amount}
    </span>
  );
}
