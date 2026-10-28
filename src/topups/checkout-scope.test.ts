import { describe, expect, test } from "bun:test";

import { createCheckoutScope } from "./checkout-scope";

describe("checkout scope", () => {
  test("accepts results belonging to the active checkout", () => {
    const scope = createCheckoutScope();
    const isCurrent = scope.capture();

    expect(isCurrent()).toBe(true);
  });

  test("ignores a payment completing after close and reopen", async () => {
    const scope = createCheckoutScope();
    const oldAttempt = scope.capture();
    const payment = Promise.withResolvers<string>();
    let displayed = "new checkout";
    const completion = payment.promise.then((result) => {
      if (oldAttempt()) displayed = result;
    });

    scope.invalidate();
    const currentAttempt = scope.capture();
    payment.resolve("old payment approved");
    await completion;

    expect(displayed).toBe("new checkout");
    expect(currentAttempt()).toBe(true);
  });

  test("invalidates every callback captured before returning to the amount step", () => {
    const scope = createCheckoutScope();
    const cardResult = scope.capture();
    const pixResult = scope.capture();

    scope.invalidate();

    expect(cardResult()).toBe(false);
    expect(pixResult()).toBe(false);
  });
});
