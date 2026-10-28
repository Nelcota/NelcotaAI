import { cn } from "cn";
import type { ReactNode } from "react";

interface PanelProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Accessible name of the region, when the panel has no visible heading. */
  readonly label?: string;
}

/** Raised dark card with large rounded corners, the main surface of every screen. */
export function Panel({ children, className, label }: PanelProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        "rounded-[1.75rem] border bg-card p-5 text-card-foreground shadow-[0_24px_60px_-24px_rgb(0_0_0/0.65)] sm:p-7",
        className,
      )}
    >
      {children}
    </section>
  );
}
