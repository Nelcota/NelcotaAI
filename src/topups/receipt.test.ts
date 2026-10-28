import { describe, expect, spyOn, test } from "bun:test";

import { NelcotaError } from "@nelcota/client";

import { RECEIPT_ACCEPT, checkReceiptFile, describeUploadError, receiptPath } from "./receipt";

describe("checkReceiptFile", () => {
  test("accepts a PDF up to 5 MB", () => {
    const result = checkReceiptFile({ type: "application/pdf", size: 5 * 1024 * 1024 });

    expect(result).toEqual({ ok: true, extension: "pdf" });
  });

  test("stores JPEG as .jpg", () => {
    const result = checkReceiptFile({ type: "image/jpeg", size: 1000 });

    expect(result).toEqual({ ok: true, extension: "jpg" });
  });

  test("rejects a file over 5 MB", () => {
    const result = checkReceiptFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 });

    expect(result).toEqual({ ok: false, message: "O arquivo deve ter no máximo 5 MB." });
  });

  test("rejects an empty file", () => {
    const result = checkReceiptFile({ type: "image/png", size: 0 });

    expect(result).toEqual({ ok: false, message: "O arquivo está vazio." });
  });

  test("rejects other file types", () => {
    const result = checkReceiptFile({ type: "image/svg+xml", size: 1000 });

    expect(result.ok).toBe(false);
  });
});

describe("RECEIPT_ACCEPT", () => {
  test("lists the accepted MIME types for the file input", () => {
    expect(RECEIPT_ACCEPT).toBe("image/png,image/jpeg,image/webp,application/pdf");
  });
});

describe("receiptPath", () => {
  test("places the file inside the request folder", () => {
    const path = receiptPath("org-1", "request-1", "file-1", "png");

    expect(path).toBe("org-1/request-1/file-1.png");
  });
});

describe("describeUploadError", () => {
  test("explains a storage code", () => {
    const error = new NelcotaError({ status: 413, code: "file_too_large", message: "too big" });

    const message = describeUploadError(error);

    expect(message).toBe("O arquivo deve ter no máximo 5 MB.");
  });

  test("explains a SQLSTATE raised by attach_topup_receipt", () => {
    const error = new NelcotaError({
      status: 400,
      code: "db_error",
      message: "server text",
      sqlstate: "P0014",
    });

    const message = describeUploadError(error);

    expect(message).toBe("Este pedido não está mais aguardando pagamento.");
  });

  test("falls back to the generic API message for an unknown code", () => {
    const error = new NelcotaError({ status: 500, code: "unknown", message: "server text" });

    const message = describeUploadError(error);

    expect(message).toBe("Algo deu errado. Tente de novo em instantes.");
  });

  test("falls back to the generic message for an error that is not from the API", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined);
    const error = new TypeError("fetch failed");

    const message = describeUploadError(error);

    expect(message).toBe("Algo deu errado. Tente de novo em instantes.");
    consoleError.mockRestore();
  });
});
