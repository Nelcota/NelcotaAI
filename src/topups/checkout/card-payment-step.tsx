import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { sessionEmailQuery } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CardDetails,
  CardPaymentForm,
  MAX_INSTALLMENTS,
  describeCardRejection,
  payTopupWithCardFn,
} from "@/payments";
import { formatCents } from "@/shared/format";

import { readAccessToken } from "../access-token";
import { describePaymentFailure } from "../payment-messages";

interface CardPaymentStepProps {
  readonly amountInCents: number;
  readonly onApproved: () => void;
  /** The issuer is still analysing the payment; it settles later by itself. */
  readonly onInReview: () => void;
  readonly onBack: () => void;
}

/** Pays the chosen amount by card: summary, the Mercado Pago card form and trust signals. */
export function CardPaymentStep({
  amountInCents,
  onApproved,
  onInReview,
  onBack,
}: CardPaymentStepProps) {
  const attemptId = useRef<string | null>(null);
  const email = useQuery(sessionEmailQuery);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pay = useCallback(
    async (card: CardDetails) => {
      setErrorMessage(null);
      try {
        attemptId.current ??= crypto.randomUUID();
        const result = await payTopupWithCardFn({
          data: {
            accessToken: await readAccessToken(),
            amountInCents,
            card,
            attemptId: attemptId.current,
          },
        });
        if (result.ok === false && result.requestId != null) {
          onInReview();
          return;
        }
        if (result.ok === false) {
          attemptId.current = null;
          setErrorMessage(describePaymentFailure(result.reason));
          return;
        }
        if (result.status === "confirmed") {
          onApproved();
          return;
        }
        if (result.status === "pending") {
          onInReview();
          return;
        }
        attemptId.current = null;
        setErrorMessage(describeCardRejection(result.statusDetail));
      } catch (error) {
        console.error("card payment call failed", error);
        setErrorMessage(describePaymentFailure("gateway_error"));
      }
    },
    [amountInCents, onApproved, onInReview],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Valor</span>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatCents(amountInCents)}
          </span>
        </div>
        <span className="text-right text-sm text-muted-foreground">
          Até {MAX_INSTALLMENTS}x, juros do parcelamento
          <br />
          cobrados pelo cartão
        </span>
      </div>

      {errorMessage != null && (
        <Alert variant="destructive" className="rounded-xl" aria-live="assertive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {email.isPending ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : (
        <CardPaymentForm
          amountInCents={amountInCents}
          payerEmail={email.data ?? null}
          onSubmit={pay}
        />
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Voltar
        </button>
        <p className="text-right text-xs text-muted-foreground">
          Processado pelo Mercado Pago. Não guardamos o seu cartão.
        </p>
      </div>
    </div>
  );
}
