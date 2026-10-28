import { cn } from "cn";
import { CheckIcon } from "lucide-react";

export type SignUpStep = "account" | "company";

const STEPS = [
  { id: "account", label: "Seus dados" },
  { id: "company", label: "Sua empresa" },
] as const satisfies readonly { id: SignUpStep; label: string }[];

/** Two-step progress of the sign-up: done steps get a check, the current one is highlighted. */
export function SignUpSteps({ current }: { readonly current: SignUpStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <nav aria-label="Etapas do cadastro">
      <ol className="grid grid-cols-2 gap-3">
        {STEPS.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className="flex flex-col gap-2.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 rounded-full transition-colors duration-300",
                  isDone || isCurrent ? "bg-primary" : "bg-secondary",
                )}
              />
              <span
                className={cn(
                  "flex items-center gap-2 text-sm font-medium",
                  isDone || isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <StepMarker number={index + 1} isDone={isDone} isCurrent={isCurrent} />
                {step.label}
                {isDone && <span className="sr-only">(concluída)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepMarker({
  number,
  isDone,
  isCurrent,
}: {
  readonly number: number;
  readonly isDone: boolean;
  readonly isCurrent: boolean;
}) {
  if (isDone) {
    return (
      <span
        aria-hidden="true"
        className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <CheckIcon className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 items-center justify-center rounded-full border text-xs",
        isCurrent && "border-brand text-brand",
      )}
    >
      {number}
    </span>
  );
}
