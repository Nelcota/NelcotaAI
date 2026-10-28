/** The signed-in session ended while the customer was paying. */
export class SessionExpiredError extends Error {
  constructor() {
    super("no access token: the session ended");
    this.name = "SessionExpiredError";
  }
}

/** A failed Pix creation, with the message to show. */
export class PixCreationError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(`pix creation failed: ${userMessage}`);
    this.name = "PixCreationError";
    this.userMessage = userMessage;
  }
}

/** Thrown when the data cannot produce a valid Pix code. */
export class InvalidPixPaymentError extends Error {
  override readonly name = "InvalidPixPaymentError";
}
