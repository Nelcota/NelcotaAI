/** A persisted Pix checkout ready to be paid. */
export interface CreatedPix {
  readonly requestId: string;
  readonly qrCode: string;
  readonly expiresAt: string;
  readonly amountInCents: number;
}

/** Callbacks captured synchronously for one submission, before mutation options can change. */
export interface PixSubmission {
  readonly amountInCents: number;
  readonly onPixCreated: (pix: CreatedPix) => void;
  readonly onPending: (amountInCents: number) => void;
  readonly onApproved: (amountInCents: number) => void;
}

export type PixCreationOutcome =
  | CreatedPix
  | { readonly pendingAmountInCents: number }
  | { readonly approvedAmountInCents: number };

/** Delivers a result to its original checkout, even when the hook receives newer options. */
export function completePixSubmission(result: PixCreationOutcome, submission: PixSubmission): void {
  if ("approvedAmountInCents" in result) {
    submission.onApproved(result.approvedAmountInCents);
    return;
  }
  if ("pendingAmountInCents" in result) {
    submission.onPending(result.pendingAmountInCents);
    return;
  }
  submission.onPixCreated(result);
}
