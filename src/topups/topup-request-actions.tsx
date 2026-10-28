import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BanIcon, PaperclipIcon, QrCodeIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { DialogHeading } from "@/components/dialog-heading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { describeApiError } from "@/shared/api-error";
import { formatCents } from "@/shared/format";
import { getNelcotaClient } from "@/shared/nelcota";

import { PixInstructions } from "./pix-instructions";
import { PixPaymentPanel } from "./pix-payment-panel";
import { toPixReceiver } from "./pix-receiver";
import { ReceiptUploader } from "./receipt-uploader";
import { TOPUPS_QUERY_KEY, pixSettingsQuery } from "./topups.queries";
import type { TopupPaymentMethod, topupRequestSchema } from "./topups.schemas";

const CANCEL_ERRORS: ReadonlyMap<string, string> = new Map([
  ["P0020", "Este pagamento ainda está sendo conferido. Aguarde a situação antes de cancelar."],
  ["P0014", "Este pedido não está mais aguardando pagamento."],
  ["P0002", "Pedido não encontrado."],
]);

// A legacy manual Pix is checked by an admin from the receipt; online payments settle by themselves.
const CANCEL_WARNING_BY_METHOD = {
  manual_pix:
    "Cancele só se você ainda não pagou. Se já pagou, anexe o comprovante: a equipe confere e libera o crédito.",
  pix: "Cancele só se você ainda não pagou. Se já pagou, o crédito entra sozinho em instantes.",
  card: "Cancele só se você ainda não pagou. Se já pagou, o crédito entra sozinho em instantes.",
} as const satisfies Record<TopupPaymentMethod, string>;

type OpenDialog = "pix" | "receipt" | "cancel" | null;

/** The fields of a pending request its actions need. */
type PendingRequest = Pick<
  z.infer<typeof topupRequestSchema>,
  "id" | "amount_cents" | "receipt_path" | "payment_method" | "pix_qr_code" | "pix_expires_at"
>;

/** A Mercado Pago Pix code saved with the request. */
interface OnlinePix {
  readonly qrCode: string;
  readonly expiresAt: string;
}

interface TopupRequestActionsProps {
  readonly organizationId: string;
  readonly request: PendingRequest;
}

/**
 * Buttons of a pending request. A Mercado Pago Pix can be paid again from its saved code; a
 * manual Pix shows the receiving data and takes a receipt. A card payment under review settles
 * by polling and can be withdrawn by the customer.
 */
export function TopupRequestActions({ organizationId, request }: TopupRequestActionsProps) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const close = () => setOpenDialog(null);
  const requestId = request.id;
  const amountInCents = request.amount_cents;
  const paymentMethod = request.payment_method;
  const hasReceipt = request.receipt_path != null;
  const amount = formatCents(amountInCents);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {paymentMethod !== "card" && (
          <Button
            className="h-10 rounded-full px-4"
            aria-label={`${paymentMethod === "pix" ? "Pagar o Pix" : "Ver Pix"} do pedido de ${amount}`}
            onClick={() => setOpenDialog("pix")}
          >
            <QrCodeIcon data-icon="inline-start" />
            {paymentMethod === "pix" ? "Pagar o Pix" : "Ver Pix"}
          </Button>
        )}
        {paymentMethod === "manual_pix" && (
          <Button
            variant="outline"
            className="h-10 rounded-full px-4"
            aria-label={`${hasReceipt ? "Trocar comprovante" : "Anexar comprovante"} do pedido de ${amount}`}
            onClick={() => setOpenDialog("receipt")}
          >
            <PaperclipIcon data-icon="inline-start" />
            {hasReceipt ? "Trocar comprovante" : "Anexar comprovante"}
          </Button>
        )}
        <Button
          variant="ghost"
          className="h-10 rounded-full px-4 text-negative hover:text-negative"
          aria-label={`Cancelar o pedido de ${amount}`}
          onClick={() => setOpenDialog("cancel")}
        >
          <BanIcon data-icon="inline-start" />
          Cancelar
        </Button>
      </div>

      <Dialog open={openDialog === "pix"} onOpenChange={closeWhenDismissed(close)}>
        <DialogContent>
          <DialogHeading
            title="Pague com Pix"
            description={
              paymentMethod === "pix"
                ? `Recarga de ${amount}. O crédito entra sozinho assim que o pagamento cair.`
                : `Pedido de ${amount}.`
            }
          />
          {paymentMethod === "pix" ? (
            <OnlinePixBody
              requestId={requestId}
              amountInCents={amountInCents}
              onlinePix={toOnlinePix(request)}
              onDone={close}
            />
          ) : (
            <ManualPixBody requestId={requestId} amountInCents={amountInCents} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === "receipt"} onOpenChange={closeWhenDismissed(close)}>
        <DialogContent>
          <DialogHeading
            title="Comprovante do Pix"
            description={`Pedido de ${amount}. Envie a foto ou o PDF do comprovante.`}
          />
          <FieldGroup>
            <ReceiptUploader
              organizationId={organizationId}
              requestId={requestId}
              hasReceipt={hasReceipt}
              onUploaded={close}
            />
          </FieldGroup>
        </DialogContent>
      </Dialog>

      <CancelRequestDialog
        open={openDialog === "cancel"}
        onClose={close}
        requestId={requestId}
        amount={amount}
        paymentMethod={paymentMethod}
      />
    </>
  );
}

/** Radix reports every open/close; only a dismissal matters, since the buttons above open. */
function closeWhenDismissed(close: () => void): (open: boolean) => void {
  return (open) => {
    if (open === false) {
      close();
    }
  };
}

function toOnlinePix(request: PendingRequest): OnlinePix | null {
  if (request.pix_qr_code == null || request.pix_expires_at == null) {
    return null;
  }
  return { qrCode: request.pix_qr_code, expiresAt: request.pix_expires_at };
}

interface CancelRequestDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly requestId: string;
  readonly amount: string;
  readonly paymentMethod: TopupPaymentMethod;
}

function OnlinePixBody({
  requestId,
  amountInCents,
  onlinePix,
  onDone,
}: {
  readonly requestId: string;
  readonly amountInCents: number;
  readonly onlinePix: OnlinePix | null;
  readonly onDone: () => void;
}) {
  const queryClient = useQueryClient();

  if (onlinePix == null) {
    return (
      <Alert className="rounded-2xl">
        <AlertDescription>
          Este Pix não pode mais ser pago. Cancele e faça uma nova recarga.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <PixPaymentPanel
      requestId={requestId}
      qrCode={onlinePix.qrCode}
      expiresAt={onlinePix.expiresAt}
      amountInCents={amountInCents}
      onPaid={() => {
        onDone();
        toast.success(`Pagamento recebido! ${formatCents(amountInCents)} adicionados ao saldo.`);
        void queryClient.invalidateQueries({ queryKey: TOPUPS_QUERY_KEY });
      }}
      onRestart={() => {
        onDone();
        void queryClient.invalidateQueries({ queryKey: TOPUPS_QUERY_KEY });
      }}
    />
  );
}

function ManualPixBody({
  requestId,
  amountInCents,
}: {
  readonly requestId: string;
  readonly amountInCents: number;
}) {
  const settings = useQuery(pixSettingsQuery);
  const receiver = toPixReceiver(settings.data);

  if (receiver == null) {
    return (
      <p className="text-sm text-muted-foreground">
        Os dados de pagamento ainda não estão disponíveis. Fale com o suporte.
      </p>
    );
  }
  return (
    <PixInstructions amountInCents={amountInCents} requestId={requestId} receiver={receiver} />
  );
}

function CancelRequestDialog({
  open,
  onClose,
  requestId,
  amount,
  paymentMethod,
}: CancelRequestDialogProps) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await getNelcotaClient().rpc("cancel_my_topup", {
        p_request_id: requestId,
      });
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      onClose();
      toast.success("Pedido cancelado.");
      await queryClient.invalidateQueries({ queryKey: TOPUPS_QUERY_KEY });
    },
  });

  return (
    <Dialog open={open} onOpenChange={closeWhenDismissed(onClose)}>
      <DialogContent>
        <DialogHeading
          title={`Cancelar a recarga de ${amount}?`}
          description={CANCEL_WARNING_BY_METHOD[paymentMethod]}
        />
        {cancel.error != null && (
          <Alert variant="destructive" className="rounded-2xl">
            <AlertDescription>{describeApiError(cancel.error, CANCEL_ERRORS)}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="h-11 rounded-xl px-5">
              Manter recarga
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            className="h-11 rounded-xl px-5"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending && <Spinner data-icon="inline-start" />}
            Sim, cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
