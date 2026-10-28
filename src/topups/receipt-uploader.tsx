import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, PaperclipIcon, UploadIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { getNelcotaClient } from "@/shared/nelcota";

import { RECEIPT_ACCEPT, checkReceiptFile, describeUploadError, receiptPath } from "./receipt";
import { TOPUPS_QUERY_KEY } from "./topups.queries";

interface ReceiptUploaderProps {
  readonly organizationId: string;
  readonly requestId: string;
  readonly hasReceipt: boolean;
  /** Called after the receipt is linked to the request. */
  readonly onUploaded?: () => void;
}

/**
 * File picker that uploads the Pix receipt into the request's folder and links it to the
 * request, so the admin can check the payment without searching the bank statement.
 */
export function ReceiptUploader({
  organizationId,
  requestId,
  hasReceipt,
  onUploaded,
}: ReceiptUploaderProps) {
  const inputId = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async ({ file, extension }: { file: File; extension: string }) => {
      const nelcota = getNelcotaClient();
      const path = receiptPath(organizationId, requestId, crypto.randomUUID(), extension);
      const uploaded = await nelcota.storage.from("receipts").upload(path, file);
      if (uploaded.error != null) {
        throw uploaded.error;
      }
      const { error } = await nelcota.rpc("attach_topup_receipt", {
        p_request_id: requestId,
        p_receipt_path: path,
      });
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Comprovante enviado. Vamos conferir o pagamento.");
      onUploaded?.();
      await queryClient.invalidateQueries({ queryKey: TOPUPS_QUERY_KEY });
    },
    onError: (error) => setProblem(describeUploadError(error)),
  });

  function choose(file: File | undefined) {
    setProblem(null);
    if (file == null) {
      return;
    }
    setFileName(file.name);
    const check = checkReceiptFile(file);
    if (check.ok === false) {
      setProblem(check.message);
      return;
    }
    upload.mutate({ file, extension: check.extension });
  }

  const errorId = `${inputId}-error`;
  return (
    <Field data-invalid={problem != null}>
      <FieldLabel htmlFor={inputId}>
        {hasReceipt ? "Trocar comprovante" : "Comprovante do Pix (opcional)"}
      </FieldLabel>
      {/* The native file button shows the browser's own (English) text, so it is visually
          hidden and replaced by a Portuguese button; it stays focusable for keyboard users. */}
      <div className="flex items-center gap-3">
        <input
          id={inputId}
          type="file"
          accept={RECEIPT_ACCEPT}
          disabled={upload.isPending}
          aria-invalid={problem != null}
          aria-describedby={problem == null ? `${inputId}-hint` : errorId}
          onChange={(event) => choose(event.target.files?.[0])}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          aria-hidden="true"
          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50 hover:bg-accent"
        >
          <PaperclipIcon className="size-4" />
          Escolher arquivo
        </label>
        <span className="truncate text-sm text-muted-foreground">
          {fileName ?? "Nenhum arquivo escolhido"}
        </span>
      </div>
      <FieldDescription id={`${inputId}-hint`} className="flex items-center gap-1.5">
        {upload.isPending && <Spinner />}
        {upload.isPending && "Enviando…"}
        {upload.isPending === false && hasReceipt && (
          <>
            <CircleCheckIcon aria-hidden="true" className="size-4 text-positive" />
            Comprovante já enviado.
          </>
        )}
        {upload.isPending === false && hasReceipt === false && (
          <>
            <UploadIcon aria-hidden="true" className="size-4" />
            Imagem ou PDF de até 5 MB. Ajuda a confirmar mais rápido.
          </>
        )}
      </FieldDescription>
      {problem != null && <FieldError id={errorId}>{problem}</FieldError>}
    </Field>
  );
}
