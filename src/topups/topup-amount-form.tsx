import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { useRef, useState } from "react";
import { NumberFormatBase } from "react-number-format";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { startPixTopupFn } from "@/payments";
import { firstErrorMessage } from "@/shared/form-errors";
import { REVALIDATE_AFTER_SUBMIT } from "@/shared/form-validation";
import { formatCents, formatCentsParts } from "@/shared/format";
import { parseBrlToCents } from "@/shared/money";

import { readAccessToken } from "./access-token";
import { amountDigits, applyAmountKey, maskAmountInput } from "./amount-mask";
import { formatCompactReais } from "./compact-reais";
import { describePaymentFailure, describePixCreationError } from "./payment-messages";
import { type CheckoutMethod, PaymentMethodPicker } from "./payment-method-picker";
import {
  completePixSubmission,
  type CreatedPix,
  type PixSubmission,
  type PixCreationOutcome,
} from "./pix-checkout";
import { PixCreationError } from "./topups.errors";
import { createTopupAmountSchema } from "./topups.schemas";

// Quick picks, in reais as the customer reads them; out-of-range ones are hidden.
const SUGGESTED_AMOUNTS = ["50", "100", "200", "500"] as const;

interface TopupAmountFormProps {
  readonly minimumInCents: number;
  readonly maximumInCents: number;
  /** Amount to start with, when coming back to this step. */
  readonly initialAmountInCents: number | null;
  readonly initialMethod: CheckoutMethod;
  readonly onPixCreated: (pix: CreatedPix) => void;
  readonly onPending: (amountInCents: number) => void;
  readonly onApproved: (amountInCents: number) => void;
  readonly onCardChosen: (amountInCents: number) => void;
}

/**
 * Picks the amount and how to pay: a large banking-style input that fills in from the cents,
 * quick picks, the accepted range and Pix or card. With Pix, submitting creates the code.
 */
export function TopupAmountForm({
  minimumInCents,
  maximumInCents,
  initialAmountInCents,
  initialMethod,
  onPixCreated,
  onPending,
  onApproved,
  onCardChosen,
}: TopupAmountFormProps) {
  const attemptId = useRef<string | null>(null);
  const [method, setMethod] = useState<CheckoutMethod>(initialMethod);
  const schema = createTopupAmountSchema(minimumInCents, maximumInCents);
  const suggestions = SUGGESTED_AMOUNTS.map((amount) => parseBrlToCents(amount)).filter(
    (cents): cents is number => isInRange(cents, minimumInCents, maximumInCents),
  );

  const createPix = useMutation({
    mutationFn: async ({ amountInCents }: PixSubmission): Promise<PixCreationOutcome> => {
      attemptId.current ??= crypto.randomUUID();
      const result = await startPixTopupFn({
        data: { accessToken: await readAccessToken(), amountInCents, attemptId: attemptId.current },
      });
      if (result.ok === false) {
        if (result.requestId != null) return { pendingAmountInCents: amountInCents };
        attemptId.current = null;
        throw new PixCreationError(describePaymentFailure(result.reason));
      }
      if (result.status === "confirmed") return { approvedAmountInCents: amountInCents };
      return { ...result, amountInCents };
    },
    onSuccess: completePixSubmission,
  });

  const form = useForm({
    defaultValues: {
      amount: initialAmountInCents == null ? "" : formatCentsParts(initialAmountInCents).amount,
    },
    // Validate on the first submit, then on every change.
    validationLogic: REVALIDATE_AFTER_SUBMIT,
    validators: { onDynamic: schema },
    onSubmit: ({ value }) => {
      const amountInCents = schema.parse(value).amount;
      if (method === "card") {
        onCardChosen(amountInCents);
        return;
      }
      // mutate() keeps the error in createPix.error, which the alert below shows.
      createPix.mutate({ amountInCents, onPixCreated, onPending, onApproved });
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {createPix.error != null && (
        <Alert variant="destructive" className="rounded-xl">
          <AlertDescription>{describePixCreationError(createPix.error)}</AlertDescription>
        </Alert>
      )}
      <form.Field name="amount">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && field.state.meta.isValid === false;
          const errorMessage = isInvalid ? firstErrorMessage(field.state.meta.errors) : null;
          const selectedCents = parseBrlToCents(field.state.value);
          const validCents = isInRange(selectedCents, minimumInCents, maximumInCents)
            ? selectedCents
            : null;
          return (
            <div className="flex flex-col gap-7">
              <div className="flex flex-col gap-3">
                <label htmlFor="topup-amount" className="text-sm text-muted-foreground">
                  Quanto você quer recarregar?<span className="sr-only"> Valor em reais.</span>
                </label>
                <div
                  className={cn(
                    "flex items-baseline gap-2 border-b-2 pb-2 transition-colors focus-within:border-brand",
                    isInvalid && "border-negative focus-within:border-negative",
                  )}
                >
                  <span aria-hidden="true" className="text-2xl font-medium text-muted-foreground">
                    R$
                  </span>
                  <NumberFormatBase
                    id="topup-amount"
                    name="amount"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0,00"
                    value={field.state.value}
                    format={maskAmountInput}
                    removeFormatting={amountDigits}
                    onBlur={field.handleBlur}
                    onKeyDown={(event) => {
                      if (event.ctrlKey || event.metaKey || event.altKey) {
                        return;
                      }
                      const input = event.currentTarget;
                      const replacesAll =
                        input.selectionStart === 0 && input.selectionEnd === input.value.length;
                      const next = applyAmountKey(input.value, event.key, replacesAll);
                      if (next == null) {
                        return;
                      }
                      event.preventDefault();
                      field.handleChange(next);
                    }}
                    onValueChange={({ formattedValue }) => field.handleChange(formattedValue)}
                    aria-invalid={isInvalid}
                    aria-describedby="topup-amount-range"
                    className="w-full min-w-0 bg-transparent text-5xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/40"
                  />
                </div>
                <p
                  id="topup-amount-range"
                  aria-live="polite"
                  className={cn("text-sm text-muted-foreground", isInvalid && "text-negative")}
                >
                  {errorMessage ??
                    `Mínimo ${formatCompactReais(minimumInCents)} · máximo ${formatCompactReais(maximumInCents)}`}
                </p>
                {suggestions.length > 0 && (
                  <div role="group" aria-label="Valores sugeridos" className="flex flex-wrap gap-2">
                    {suggestions.map((cents) => {
                      const isSelected = selectedCents === cents;
                      return (
                        <button
                          key={cents}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => field.handleChange(formatCentsParts(cents).amount)}
                          className={cn(
                            "h-9 rounded-lg border px-3.5 text-sm font-medium tabular-nums transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            isSelected &&
                              "border-foreground bg-foreground text-background hover:bg-foreground",
                          )}
                        >
                          {formatCompactReais(cents)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <PaymentMethodPicker value={method} onChange={setMethod} />
              <div className="flex flex-col gap-3">
                <Button
                  type="submit"
                  disabled={createPix.isPending}
                  className="h-12 w-full justify-between rounded-xl px-5 text-base"
                >
                  <span className="flex items-center gap-2">
                    {createPix.isPending && <Spinner />}
                    {method === "pix" ? "Gerar Pix" : "Continuar"}
                  </span>
                  {validCents != null && (
                    <span className="tabular-nums">{formatCents(validCents)}</span>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Pagamento processado pelo Mercado Pago.
                </p>
              </div>
            </div>
          );
        }}
      </form.Field>
    </form>
  );
}

function isInRange(
  cents: number | null,
  minimumInCents: number,
  maximumInCents: number,
): cents is number {
  return cents != null && cents >= minimumInCents && cents <= maximumInCents;
}
