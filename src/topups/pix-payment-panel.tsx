import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { QrCode } from "@/components/qr-code";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { refreshTopupPaymentFn } from "@/payments";
import { formatCents } from "@/shared/format";

import { readAccessToken } from "./access-token";
import { describePaymentFailure, formatCountdown } from "./payment-messages";
import { pixPaymentStatus } from "./pix-payment-status";
import { useCopyToClipboard } from "./use-copy-to-clipboard";
import { useNow } from "./use-now";

// How often the screen asks whether the Pix was paid; Mercado Pago confirms in seconds.
const PAYMENT_CHECK_INTERVAL_IN_MS = 4000;
const COUNTDOWN_TICK_IN_MS = 1000;
// Under five minutes the countdown turns orange to create a little urgency.
const URGENT_TIME_LEFT_IN_MS = 300_000;

const HOW_TO_PAY = [
  "Abra o app do seu banco e escolha Pix.",
  "Leia o QR Code ou use o Pix copia e cola.",
  "Confirme. O crédito entra sozinho, nesta tela.",
] as const;

interface PixPaymentPanelProps {
  readonly requestId: string;
  readonly qrCode: string;
  /** UTC ISO 8601 deadline. */
  readonly expiresAt: string;
  readonly amountInCents: number;
  readonly onPaid: () => void;
  /** Creates a new Pix after this one expired. */
  readonly onRestart: () => void;
}

/**
 * A Mercado Pago Pix ready to pay: QR Code, one-tap copy, countdown and a live status that
 * moves on by itself as soon as the payment is confirmed.
 */
export function PixPaymentPanel({
  requestId,
  qrCode,
  expiresAt,
  amountInCents,
  onPaid,
  onRestart,
}: PixPaymentPanelProps) {
  const now = useNow(COUNTDOWN_TICK_IN_MS);
  const deadline = new Date(expiresAt).getTime();
  const timeLeftInMs = Number.isNaN(deadline) ? 0 : deadline - now;
  const status = useQuery({
    queryKey: ["topup-payment", requestId],
    queryFn: async () => {
      const result = await refreshTopupPaymentFn({
        data: { accessToken: await readAccessToken(), requestId },
      });
      // Retryable checks keep waiting; resolved duplicates stop polling and hide the payment code.
      return pixPaymentStatus(result);
    },
    refetchInterval: (query) =>
      query.state.data === "confirmed" ||
      query.state.data === "cancelled" ||
      query.state.data === "duplicate"
        ? false
        : PAYMENT_CHECK_INTERVAL_IN_MS,
  });
  const isPaid = status.data === "confirmed";
  const isExpired = isPaid === false && (timeLeftInMs <= 0 || status.data === "cancelled");

  // Reports the payment once, even if the parent re-renders before closing this panel.
  const hasReportedPayment = useRef(false);
  useEffect(() => {
    if (isPaid === false || hasReportedPayment.current) {
      return;
    }
    hasReportedPayment.current = true;
    onPaid();
  }, [isPaid, onPaid]);

  if (status.data === "duplicate") {
    return (
      <Alert>
        <AlertDescription>{describePaymentFailure("duplicate_payment")}</AlertDescription>
      </Alert>
    );
  }

  if (isExpired) {
    return <ExpiredPix onRestart={onRestart} />;
  }

  const isUrgent = timeLeftInMs < URGENT_TIME_LEFT_IN_MS;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Valor</span>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatCents(amountInCents)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <span role="status" className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            Aguardando pagamento
          </span>
          <span className={cn("text-muted-foreground tabular-nums", isUrgent && "text-brand")}>
            Expira em {formatCountdown(timeLeftInMs)}
          </span>
        </div>
      </div>

      <div className="flex justify-center rounded-xl border bg-white p-4">
        <QrCode
          value={qrCode}
          label={`QR Code do Pix de ${formatCents(amountInCents)}`}
          className="size-52"
        />
      </div>

      <CopyPixCodeButton code={qrCode} />

      <ol className="flex list-inside list-decimal flex-col gap-1.5 text-sm text-muted-foreground marker:text-foreground">
        {HOW_TO_PAY.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">Pagamento processado pelo Mercado Pago.</p>
    </div>
  );
}

function CopyPixCodeButton({ code }: { readonly code: string }) {
  const { isCopied, copy: copyToClipboard } = useCopyToClipboard();

  async function copy() {
    const hasCopied = await copyToClipboard(code);
    if (hasCopied === false) {
      toast.error("Não foi possível copiar. Use o QR Code ou tente de novo.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">Pix copia e cola</span>
      <div className="flex items-center gap-2 rounded-xl border p-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
          {code}
        </span>
        <Button
          type="button"
          onClick={() => void copy()}
          variant={isCopied ? "outline" : "default"}
          className="h-9 shrink-0 rounded-lg px-4"
        >
          {isCopied ? (
            <CheckIcon data-icon="inline-start" />
          ) : (
            <CopyIcon data-icon="inline-start" />
          )}
          {isCopied ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}

function ExpiredPix({ onRestart }: { readonly onRestart: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border px-5 py-6">
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">Este Pix expirou</p>
        <p className="text-sm text-muted-foreground">
          Nada foi cobrado. Gere um novo código para concluir a recarga.
        </p>
      </div>
      <Button type="button" onClick={onRestart} className="h-11 rounded-xl px-5">
        <RefreshCwIcon data-icon="inline-start" />
        Gerar novo Pix
      </Button>
    </div>
  );
}
