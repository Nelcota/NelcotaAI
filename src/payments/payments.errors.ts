/** The Mercado Pago credentials or the service token are missing from the server env. */
export class PaymentsNotConfiguredError extends Error {
  constructor(cause: unknown) {
    super("payments are not configured: check the Mercado Pago and Nelcota server variables", {
      cause,
    });
    this.name = "PaymentsNotConfiguredError";
  }
}

/** Mercado Pago answered with an error status or a body the app does not understand. */
export class MercadoPagoApiError extends Error {
  readonly httpStatus: number;

  constructor(operation: string, httpStatus: number, detail: string) {
    super(`Mercado Pago ${operation} failed with HTTP ${httpStatus}: ${detail}`);
    this.name = "MercadoPagoApiError";
    this.httpStatus = httpStatus;
  }
}

/** The top-up request does not exist or belongs to another organization. */
export class TopupRequestNotFoundError extends Error {
  constructor(requestId: string) {
    super(`top-up request ${requestId} not found for the caller`);
    this.name = "TopupRequestNotFoundError";
  }
}

/** The signed-in account is not linked to an organization, so nobody can be charged. */
export class PayerNotFoundError extends Error {
  constructor() {
    super("the account has no organization to pay for");
    this.name = "PayerNotFoundError";
  }
}

/** An allocated payment attempt failed but remains available for recovery. */
export class PaymentAttemptError extends Error {
  readonly requestId: string;

  constructor(requestId: string, cause: unknown) {
    super("payment attempt requires recovery", { cause });
    this.name = "PaymentAttemptError";
    this.requestId = requestId;
  }
}

/** Another worker is processing the payment, or its result is not available yet. */
export class PaymentPendingError extends Error {
  constructor() {
    super("payment is awaiting reconciliation");
    this.name = "PaymentPendingError";
  }
}

/** A previously submitted attempt was definitively closed and needs a new checkout identity. */
export class PaymentAttemptClosedError extends Error {
  constructor() {
    super("the payment attempt was already closed");
    this.name = "PaymentAttemptClosedError";
  }
}

/** A provider payment is already attributed to a different top-up request. */
export class DuplicatePaymentError extends Error {
  constructor() {
    super("the payment is already linked to another top-up request");
    this.name = "DuplicatePaymentError";
  }
}
