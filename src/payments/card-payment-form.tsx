import { loadMercadoPago } from "@mercadopago/sdk-js";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { CreditCardIcon } from "lucide-react";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/layout";
import { browserEnv } from "@/shared/browser.env";

import { toCardDetails } from "./mercado-pago-sdk";
import { toMercadoPagoAmount } from "./mercado-pago-values";
import { type CardDetails, MAX_INSTALLMENTS } from "./payment-payload";

// Same value as the --primary token in src/shared/styles.css: the Brick runs in an iframe and
// cannot read our CSS variables.
const BRAND_COLOR = "#cf3e14";
const SDK_LOAD_TIMEOUT_IN_MS = 15_000;
type CardPaymentProps = ComponentProps<typeof CardPayment>;
type FormState = "loading" | "mounting" | "ready" | "failed";

interface CardPaymentFormProps {
  readonly amountInCents: number;
  readonly payerEmail: string | null;
  readonly onSubmit: (card: CardDetails) => Promise<void>;
}

/** Collects card data through Mercado Pago's secure fields and submits only a token. */
export function CardPaymentForm({ amountInCents, payerEmail, onSubmit }: CardPaymentFormProps) {
  const containerId = `card-form-${useId().replaceAll(":", "")}`;
  const [state, setState] = useState<FormState>("loading");
  const { resolvedTheme } = useTheme();
  const publicKey = browserEnv.VITE_MERCADO_PAGO_PUBLIC_KEY;
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  }, [onSubmit]);
  const initialization = useMemo(
    () => ({
      amount: toMercadoPagoAmount(amountInCents),
      ...(payerEmail == null ? {} : { payer: { email: payerEmail } }),
    }),
    [amountInCents, payerEmail],
  );
  const customization = useMemo(
    () => ({
      visual: {
        style: {
          theme: resolvedTheme === "light" ? "default" : "dark",
          customVariables: { baseColor: BRAND_COLOR },
        },
      },
      paymentMethods: { maxInstallments: MAX_INSTALLMENTS },
    }),
    [resolvedTheme],
  );
  const handleReady = useCallback(() => setState("ready"), []);
  const handleError = useCallback<NonNullable<CardPaymentProps["onError"]>>((error) => {
    console.error("card form error", error);
    if (error.type === "critical") {
      setState("failed");
    }
  }, []);
  const handleSubmit = useCallback<CardPaymentProps["onSubmit"]>(async (formData) => {
    const card = toCardDetails(formData);
    if (card == null) {
      throw new Error("card form returned unusable data");
    }
    await submitRef.current(card);
  }, []);

  useEffect(() => {
    if (state === "ready" || state === "failed") {
      return;
    }
    const timeout = setTimeout(() => setState("failed"), SDK_LOAD_TIMEOUT_IN_MS);
    return () => clearTimeout(timeout);
  }, [state]);

  useEffect(() => {
    if (publicKey == null) {
      return;
    }
    let isCancelled = false;
    setState("loading");
    // The official loader handles script deduplication; run it only in the browser.
    loadMercadoPago()
      .then(() => {
        if (isCancelled === false) {
          initMercadoPago(publicKey, { locale: "pt-BR" });
          setState((current) => (current === "failed" ? current : "mounting"));
        }
      })
      .catch((error: unknown) => {
        console.error("could not load the Mercado Pago card form", error);
        if (isCancelled === false) {
          setState("failed");
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [publicKey]);

  if (publicKey == null || state === "failed") {
    return (
      <Alert className="rounded-2xl">
        <CreditCardIcon />
        <AlertDescription>
          Não foi possível carregar o formulário de cartão. Pague com Pix ou recarregue a página
          para tentar de novo.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state !== "ready" && <Skeleton className="h-80 w-full rounded-2xl" />}
      {(state === "mounting" || state === "ready") && (
        <CardPayment
          id={containerId}
          initialization={initialization}
          customization={customization}
          onReady={handleReady}
          onError={handleError}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
