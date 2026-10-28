import { CheckIcon, CopyIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { QrCode } from "@/components/qr-code";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { formatCents } from "@/shared/format";

import { useCopyToClipboard } from "../use-copy-to-clipboard";
import { buildPixCode, toTransactionId } from "./pix-brcode";

/** Receiving data configured by the admin. */
export interface PixReceiver {
  readonly pixKey: string;
  readonly receiverName: string;
  readonly city: string;
}

interface PixInstructionsProps {
  readonly amountInCents: number;
  readonly requestId: string;
  readonly receiver: PixReceiver;
}

/**
 * How to pay one request: QR code and "Pix copia e cola" with the amount already filled in,
 * plus the plain key as a fallback.
 */
export function PixInstructions({ amountInCents, requestId, receiver }: PixInstructionsProps) {
  const pixCode = useMemo(
    () =>
      buildPixCode({
        pixKey: receiver.pixKey,
        receiverName: receiver.receiverName,
        receiverCity: receiver.city,
        amountInCents,
        transactionId: toTransactionId(requestId),
      }),
    [receiver.pixKey, receiver.receiverName, receiver.city, amountInCents, requestId],
  );

  return (
    <FieldGroup>
      <div className="flex items-center gap-4 rounded-2xl border p-4">
        <QrCode
          value={pixCode}
          label={`QR code do Pix de ${formatCents(amountInCents)}`}
          className="size-36 shrink-0 rounded-lg"
        />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Valor a pagar</p>
          <p className="text-2xl font-semibold tabular-nums">{formatCents(amountInCents)}</p>
          <p className="text-xs text-muted-foreground">
            Abra o app do seu banco, escolha Pix e aponte a câmera para o código.
          </p>
        </div>
      </div>
      <CopyField
        id={`pix-code-${requestId}`}
        label="Pix copia e cola"
        value={pixCode}
        description="O valor já vem preenchido. Cole no app do seu banco em Pix > Copia e cola."
        copiedMessage="Código Pix copiado."
      />
      <PixKeyField pixKey={receiver.pixKey} receiverName={receiver.receiverName} />
      <p className="text-sm text-muted-foreground">
        Pague exatamente esse valor. Assim que identificarmos o pagamento, o crédito é liberado e
        aparece como &quot;Creditado&quot; no seu painel.
      </p>
    </FieldGroup>
  );
}

/** The Pix key, read-only with a copy button, and the receiver's name below it. */
function PixKeyField({
  pixKey,
  receiverName,
}: {
  readonly pixKey: string;
  readonly receiverName: string;
}) {
  return (
    <CopyField
      id="pix-key"
      label="Chave Pix"
      value={pixKey}
      description={`Favorecido: ${receiverName}`}
      copiedMessage="Chave Pix copiada."
    />
  );
}

interface CopyFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly description: string;
  readonly copiedMessage: string;
}

function CopyField({ id, label, value, description, copiedMessage }: CopyFieldProps) {
  const clipboard = useCopyToClipboard();

  async function copy() {
    const hasCopied = await clipboard.copy(value);
    if (hasCopied === false) {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
      return;
    }
    toast.success(copiedMessage);
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          value={value}
          readOnly
          aria-describedby={`${id}-description`}
          className="truncate"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={`Copiar ${label}`}
            onClick={() => void copy()}
          >
            {clipboard.isCopied ? <CheckIcon /> : <CopyIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
    </Field>
  );
}
