import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, WalletIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { DialogHeading } from "@/components/dialog-heading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

import { PixPaymentPanel } from "../pix-payment-panel";
import { TOPUPS_QUERY_KEY, pixSettingsQuery } from "../topups.queries";
import { CardPaymentStep } from "./card-payment-step";
import { createCheckoutScope } from "./checkout-scope";
import type { CheckoutMethod } from "./payment-method-picker";
import type { CreatedPix } from "./pix-checkout";
import { TopupAmountForm } from "./topup-amount-form";
import { TopupOutcome } from "./topup-outcome";

/** Where the customer is in the checkout. */
type CheckoutStep =
  | { readonly kind: "amount" }
  | { readonly kind: "pix"; readonly pix: CreatedPix }
  | { readonly kind: "card"; readonly amountInCents: number }
  | { readonly kind: "approved"; readonly amountInCents: number }
  | { readonly kind: "in-review"; readonly amountInCents: number };

const AMOUNT_STEP: CheckoutStep = { kind: "amount" };

/** What the customer last picked on the amount step. */
interface LastChoice {
  readonly amountInCents: number | null;
  readonly method: CheckoutMethod;
}

const NO_CHOICE: LastChoice = { amountInCents: null, method: "pix" };

/**
 * Orange pill button ("Nova recarga +") that opens the checkout: amount and payment method,
 * then a Mercado Pago Pix or card, and the credit lands on its own as soon as it is paid.
 */
export function RequestTopupDialog({
  trigger = "primary",
}: {
  /** "outline" is the secondary version used inside the company panel. */
  readonly trigger?: "primary" | "outline";
}) {
  const [scope] = useState(createCheckoutScope);
  const isCurrent = scope.capture();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<CheckoutStep>(AMOUNT_STEP);
  // Remembered so "back" and "new Pix" keep what the customer chose.
  const [lastChoice, setLastChoice] = useState<LastChoice>(NO_CHOICE);
  const queryClient = useQueryClient();

  const refreshTopups = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: TOPUPS_QUERY_KEY }),
    [queryClient],
  );

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next === false) {
      scope.invalidate();
      setStep(AMOUNT_STEP);
      setLastChoice(NO_CHOICE);
      refreshTopups();
    }
  }

  const finish = useCallback(
    (kind: "approved" | "in-review", amountInCents: number) => {
      if (isCurrent() === false) return;
      setStep({ kind, amountInCents });
      refreshTopups();
    },
    [refreshTopups, isCurrent],
  );

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {trigger === "primary" ? (
          <Button className="h-10 rounded-full px-5">
            Nova recarga
            <PlusIcon data-icon="inline-end" />
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-11 rounded-full border-brand/70 text-brand hover:bg-primary/10 hover:text-brand dark:border-brand/70"
          >
            <WalletIcon data-icon="inline-start" />
            Recarregar agora
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <CheckoutStepView
          step={step}
          lastChoice={lastChoice}
          onPixCreated={(pix) => {
            if (isCurrent() === false) return;
            setLastChoice({ amountInCents: pix.amountInCents, method: "pix" });
            setStep({ kind: "pix", pix });
            refreshTopups();
          }}
          onCardChosen={(amountInCents) => {
            if (isCurrent() === false) return;
            scope.invalidate();
            setLastChoice({ amountInCents, method: "card" });
            setStep({ kind: "card", amountInCents });
          }}
          onBackToAmount={() => {
            scope.invalidate();
            setStep(AMOUNT_STEP);
          }}
          onFinish={finish}
          onClose={() => changeOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface CheckoutStepViewProps {
  readonly step: CheckoutStep;
  readonly lastChoice: LastChoice;
  readonly onPixCreated: (pix: CreatedPix) => void;
  readonly onCardChosen: (amountInCents: number) => void;
  readonly onBackToAmount: () => void;
  readonly onFinish: (kind: "approved" | "in-review", amountInCents: number) => void;
  readonly onClose: () => void;
}

function CheckoutStepView({
  step,
  lastChoice,
  onPixCreated,
  onCardChosen,
  onBackToAmount,
  onFinish,
  onClose,
}: CheckoutStepViewProps) {
  if (step.kind === "approved" || step.kind === "in-review") {
    return <TopupOutcome kind={step.kind} amountInCents={step.amountInCents} onClose={onClose} />;
  }
  if (step.kind === "pix") {
    const { pix } = step;
    return (
      <>
        <DialogHeading
          eyebrow="Etapa 2 de 2"
          title="Pague com Pix"
          description="O crédito entra no seu saldo assim que o pagamento cair."
        />
        <PixPaymentPanel
          requestId={pix.requestId}
          qrCode={pix.qrCode}
          expiresAt={pix.expiresAt}
          amountInCents={pix.amountInCents}
          onPaid={() => onFinish("approved", pix.amountInCents)}
          onRestart={onBackToAmount}
        />
      </>
    );
  }
  if (step.kind === "card") {
    const { amountInCents } = step;
    return (
      <>
        <DialogHeading
          eyebrow="Etapa 2 de 2"
          title="Pague com cartão"
          description="O crédito entra no seu saldo assim que o pagamento for aprovado."
        />
        <CardPaymentStep
          amountInCents={amountInCents}
          onApproved={() => onFinish("approved", amountInCents)}
          onInReview={() => onFinish("in-review", amountInCents)}
          onBack={onBackToAmount}
        />
      </>
    );
  }
  return (
    <>
      <DialogHeading eyebrow="Etapa 1 de 2" title="Nova recarga" />
      <AmountStep
        lastChoice={lastChoice}
        onPixCreated={onPixCreated}
        onPending={(amountInCents) => onFinish("in-review", amountInCents)}
        onApproved={(amountInCents) => onFinish("approved", amountInCents)}
        onCardChosen={onCardChosen}
      />
    </>
  );
}

function AmountStep({
  lastChoice,
  onPixCreated,
  onPending,
  onApproved,
  onCardChosen,
}: Pick<CheckoutStepViewProps, "lastChoice" | "onPixCreated" | "onCardChosen"> & {
  readonly onPending: (amountInCents: number) => void;
  readonly onApproved: (amountInCents: number) => void;
}) {
  const settings = useQuery(pixSettingsQuery);

  if (settings.isPending) {
    return <Skeleton className="h-96 w-full rounded-3xl" />;
  }
  if (settings.isError) {
    return (
      <Alert variant="destructive" className="rounded-2xl">
        <AlertDescription>
          Não foi possível carregar as opções de recarga. Tente de novo em instantes.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <TopupAmountForm
      minimumInCents={settings.data.minimum_topup_cents}
      maximumInCents={settings.data.maximum_topup_cents}
      initialAmountInCents={lastChoice.amountInCents}
      initialMethod={lastChoice.method}
      onPixCreated={onPixCreated}
      onPending={onPending}
      onApproved={onApproved}
      onCardChosen={onCardChosen}
    />
  );
}
