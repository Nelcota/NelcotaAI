import { cn } from "cn";
import type { ReactNode } from "react";

import { MAX_INSTALLMENTS } from "@/payments";

/** How the customer chooses to pay a new top-up. Legacy manual Pix is not offered here. */
export type CheckoutMethod = "pix" | "card";

interface MethodOption {
  readonly id: CheckoutMethod;
  readonly label: string;
  readonly detail: string;
  readonly mark: ReactNode;
}

const METHODS: readonly MethodOption[] = [
  { id: "pix", label: "Pix", detail: "Crédito na hora", mark: <PixMark /> },
  {
    id: "card",
    label: "Cartão de crédito",
    detail: `Até ${MAX_INSTALLMENTS}x`,
    mark: <CardBrands />,
  },
];

interface PaymentMethodPickerProps {
  readonly value: CheckoutMethod;
  readonly onChange: (method: CheckoutMethod) => void;
}

/** List of payment methods with a radio on the right, like a banking app. */
export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-sm text-muted-foreground">Pagar com</legend>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {METHODS.map((method) => {
          const isSelected = value === method.id;
          return (
            <label
              key={method.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/50 has-focus-visible:bg-accent/50",
                isSelected && "bg-accent/40",
              )}
            >
              <input
                type="radio"
                name="payment-method"
                value={method.id}
                checked={isSelected}
                onChange={() => onChange(method.id)}
                className="peer sr-only"
              />
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-base font-medium">{method.label}</span>
                {method.mark}
              </span>
              <span className="text-sm text-muted-foreground">{method.detail}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/50 peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  isSelected && "border-brand",
                )}
              >
                {isSelected && <span className="size-2.5 rounded-full bg-brand" />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// Official Pix symbol (path from Simple Icons, CC0) in the Pix brand teal.
const PIX_SYMBOL_PATH =
  "M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156";

/** The Pix symbol. */
function PixMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[1.125rem]">
      <path d={PIX_SYMBOL_PATH} fill="#32BCAD" />
    </svg>
  );
}

/** Small accepted-brand badges. */
function CardBrands() {
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      <span className="flex h-5 items-center rounded-sm bg-white px-1.5 text-[0.625rem] font-extrabold tracking-tight text-[#1a1f71] italic">
        VISA
      </span>
      <span className="flex h-5 items-center rounded-sm bg-white px-1">
        <svg viewBox="0 0 24 16" className="h-3.5 w-5">
          <circle cx="9" cy="8" r="6" fill="#eb001b" />
          <circle cx="15" cy="8" r="6" fill="#f79e1b" fillOpacity="0.9" />
        </svg>
      </span>
      <span className="flex h-5 items-center rounded-sm bg-white px-1.5 text-[0.6875rem] font-bold text-black">
        elo
      </span>
    </span>
  );
}
