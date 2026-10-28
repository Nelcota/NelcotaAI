import type { ReactNode } from "react";

interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  /** Controls aligned to the right of the title, such as the period picker. */
  readonly actions?: ReactNode;
}

/**
 * Page title row over the colourful header band (hence always white text): the page's only
 * `h1`, with optional description and actions.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description != null && <p className="text-sm text-white/80">{description}</p>}
      </div>
      {actions != null && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Section title row inside a page. */
export function SectionHeader({ title }: { readonly title: string }) {
  return <h2 className="text-[15px] font-medium">{title}</h2>;
}
