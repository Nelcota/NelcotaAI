import type { ReactNode } from "react";

import { Delta } from "./delta";

interface KeyStatProps {
  readonly label: string;
  /** The value, usually a `Money`; must render inline content. */
  readonly children: ReactNode;
  /** Change against the previous month; null or undefined hides it. */
  readonly changePercent?: number | null | undefined;
  readonly hint?: string | undefined;
}

/** Label with an optional green/red change against the previous month, over a large value. */
export function KeyStat({ label, children, changePercent, hint }: KeyStatProps) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {label}
        {changePercent != null && <Delta percent={changePercent} comparedTo="mês anterior" />}
      </dt>
      <dd className="flex flex-col gap-1 text-[28px] leading-none">
        {children}
        {hint != null && (
          <span className="text-xs leading-normal text-muted-foreground">{hint}</span>
        )}
      </dd>
    </div>
  );
}
