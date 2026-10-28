import { cn } from "cn";
import { CheckIcon, HourglassIcon, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCents } from "@/shared/format";

interface TopupOutcomeProps {
  readonly kind: "approved" | "in-review";
  readonly amountInCents: number;
  readonly onClose: () => void;
}

const OUTCOMES = {
  approved: {
    icon: CheckIcon,
    tone: "bg-positive/15 text-positive",
    title: "Crédito adicionado",
    description: (amount: string) => `${amount} já estão disponíveis no seu saldo.`,
  },
  "in-review": {
    icon: HourglassIcon,
    tone: "bg-brand/15 text-brand",
    title: "Pagamento em análise",
    description: (amount: string) =>
      `O pagamento de ${amount} está sendo conferido. Acompanhe no histórico de recargas antes de iniciar outro.`,
  },
} as const satisfies Record<
  TopupOutcomeProps["kind"],
  { icon: LucideIcon; tone: string; title: string; description: (amount: string) => string }
>;

/** Last screen of the checkout: credit added, or payment still being analysed. */
export function TopupOutcome({ kind, amountInCents, onClose }: TopupOutcomeProps) {
  const outcome = OUTCOMES[kind];
  const Icon = outcome.icon;

  return (
    <div className="flex flex-col gap-6 pt-2">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-12 items-center justify-center rounded-full duration-300 animate-in fade-in-0",
          outcome.tone,
        )}
      >
        <Icon className="size-6" strokeWidth={2.5} />
      </span>
      <div className="flex flex-col gap-2 pr-10" role="status">
        <DialogTitle className="text-2xl">{outcome.title}</DialogTitle>
        <DialogDescription className="text-base">
          {outcome.description(formatCents(amountInCents))}
        </DialogDescription>
      </div>
      <Button onClick={onClose} className="h-12 w-full rounded-xl text-base">
        Concluir
      </Button>
    </div>
  );
}
