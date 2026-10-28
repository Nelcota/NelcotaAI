import type { ReactNode } from "react";

import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DialogHeadingProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Small uppercase line above the title, such as "Etapa 1 de 2". */
  readonly eyebrow?: string;
}

/** Header of every modal: optional eyebrow, the title and a short explanation, left aligned. */
export function DialogHeading({ title, description, eyebrow }: DialogHeadingProps) {
  return (
    <DialogHeader className="gap-1.5 pr-10 text-left">
      {eyebrow != null && (
        <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
      )}
      <DialogTitle>{title}</DialogTitle>
      {description != null && <DialogDescription>{description}</DialogDescription>}
    </DialogHeader>
  );
}
