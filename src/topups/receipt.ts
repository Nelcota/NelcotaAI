import { NelcotaError } from "@nelcota/client";

import { describeApiError } from "@/shared/api-error";

// Same limits as the "receipts" bucket (migration V7). The server checks again using the file's
// real content; this only gives the customer an immediate, friendly message.
const BYTES_PER_MEGABYTE = 1_048_576;
const MAX_RECEIPT_MEGABYTES = 5;
const MAX_RECEIPT_BYTES = MAX_RECEIPT_MEGABYTES * BYTES_PER_MEGABYTE;

const EXTENSION_BY_TYPE: ReadonlyMap<string, string> = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
]);

/** Value for the file input's `accept` attribute. */
export const RECEIPT_ACCEPT = [...EXTENSION_BY_TYPE.keys()].join(",");

/** Result of checking a chosen receipt file. */
export type ReceiptCheck =
  | { readonly ok: true; readonly extension: string }
  | { readonly ok: false; readonly message: string };

/**
 * Checks a receipt before uploading it.
 *
 * @param file - The chosen file's MIME type and size in bytes.
 * @returns The extension to store it with, or a message in Portuguese explaining the problem.
 */
export function checkReceiptFile(file: {
  readonly type: string;
  readonly size: number;
}): ReceiptCheck {
  const extension = EXTENSION_BY_TYPE.get(file.type);
  if (extension == null) {
    return { ok: false, message: "Envie uma imagem (PNG, JPG ou WEBP) ou um PDF." };
  }
  if (Number.isFinite(file.size) === false || file.size <= 0) {
    return { ok: false, message: "O arquivo está vazio." };
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return { ok: false, message: "O arquivo deve ter no máximo 5 MB." };
  }
  return { ok: true, extension };
}

/**
 * Where a receipt is stored: inside the request's folder, as the storage policies require.
 *
 * @param organizationId - The customer's organization.
 * @param requestId - The top-up request.
 * @param fileId - A unique id for the file, so a new upload never replaces an old one.
 * @param extension - File extension from {@link checkReceiptFile}.
 * @returns The path, `{organization}/{request}/{file}.{extension}`.
 */
export function receiptPath(
  organizationId: string,
  requestId: string,
  fileId: string,
  extension: string,
): string {
  return `${organizationId}/${requestId}/${fileId}.${extension}`;
}

const RECEIPT_ERRORS: ReadonlyMap<string, string> = new Map([
  ["P0014", "Este pedido não está mais aguardando pagamento."],
  ["P0002", "Não encontramos o arquivo enviado. Tente de novo."],
  ["22023", "Não foi possível vincular o arquivo ao pedido. Tente de novo."],
]);

// Storage answers with its own codes instead of SQLSTATEs.
const STORAGE_ERRORS: ReadonlyMap<string, string> = new Map([
  ["file_too_large", "O arquivo deve ter no máximo 5 MB."],
  ["mime_type_not_allowed", "Envie uma imagem (PNG, JPG ou WEBP) ou um PDF."],
  ["storage_full", "Não há espaço para receber arquivos agora. Fale com o suporte."],
]);

/**
 * Explains why uploading or linking a receipt failed.
 *
 * @param error - Whatever the storage upload or the `attach_topup_receipt` call threw.
 * @returns A message in Portuguese: storage codes first, then the SQLSTATEs the function raises,
 * then the generic API messages.
 */
export function describeUploadError(error: unknown): string {
  if (error instanceof NelcotaError) {
    const storageMessage = STORAGE_ERRORS.get(error.code);
    if (storageMessage != null) {
      return storageMessage;
    }
  }
  return describeApiError(error, RECEIPT_ERRORS);
}
