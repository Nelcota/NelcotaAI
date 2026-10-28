import { describe, expect, test } from "bun:test";

import { MutationObserver, QueryClient } from "@tanstack/react-query";

import { createCheckoutScope } from "./checkout-scope";
import {
  completePixSubmission,
  type CreatedPix,
  type PixCreationOutcome,
  type PixSubmission,
} from "./pix-checkout";

const PIX: CreatedPix = {
  requestId: "test-request",
  qrCode: "test-qr",
  expiresAt: "2026-10-27T22:30:00Z",
  amountInCents: 5000,
};

describe("Pix mutation ownership", () => {
  test("delivers a ready Pix to the submitted checkout", () => {
    const received: CreatedPix[] = [];

    completePixSubmission(PIX, {
      amountInCents: 5000,
      onPixCreated: (pix) => received.push(pix),
      onPending: () => {
        throw new Error("unexpected pending outcome");
      },
      onApproved: () => {
        throw new Error("unexpected approved outcome");
      },
    });

    expect(received).toEqual([PIX]);
  });

  test("delivers an uncertain creation to the original pending callback", () => {
    const amounts: number[] = [];

    completePixSubmission(
      { pendingAmountInCents: 5000 },
      {
        amountInCents: 5000,
        onPixCreated: () => {
          throw new Error("unexpected ready outcome");
        },
        onPending: (amount) => amounts.push(amount),
        onApproved: () => {
          throw new Error("unexpected approved outcome");
        },
      },
    );

    expect(amounts).toEqual([5000]);
  });

  test("delivers an already approved Pix without asking the customer to pay again", () => {
    const amounts: number[] = [];

    completePixSubmission(
      { approvedAmountInCents: 5000 },
      {
        amountInCents: 5000,
        onPixCreated: () => {
          throw new Error("unexpected payable Pix");
        },
        onPending: () => {
          throw new Error("unexpected pending outcome");
        },
        onApproved: (amount) => amounts.push(amount),
      },
    );

    expect(amounts).toEqual([5000]);
  });

  test.each([PIX, { pendingAmountInCents: 5000 }, { approvedAmountInCents: 5000 }])(
    "ignores a late outcome after pending mutation options update and unmount",
    async (outcome) => {
      const client = new QueryClient();
      const scope = createCheckoutScope();
      const ownsSubmission = scope.capture();
      const payment = Promise.withResolvers<PixCreationOutcome>();
      let displayed = "new checkout";
      const variables: PixSubmission = {
        amountInCents: 5000,
        onPixCreated: () => {
          if (ownsSubmission()) displayed = "old Pix";
        },
        onPending: () => {
          if (ownsSubmission()) displayed = "old pending attempt";
        },
        onApproved: () => {
          if (ownsSubmission()) displayed = "old approved attempt";
        },
      };
      const options = { mutationFn: () => payment.promise, onSuccess: completePixSubmission };
      const observer = new MutationObserver<PixCreationOutcome, Error, PixSubmission>(
        client,
        options,
      );
      const unsubscribe = observer.subscribe(() => {});
      const completion = observer.mutate(variables);
      await Promise.resolve();

      scope.invalidate();
      observer.setOptions({
        ...options,
        onSuccess: (result, originalSubmission) =>
          completePixSubmission(result, originalSubmission),
      });
      unsubscribe();
      payment.resolve(outcome);
      await completion;

      expect(scope.capture()()).toBe(true);
      expect(displayed).toBe("new checkout");
      client.clear();
    },
  );
});
