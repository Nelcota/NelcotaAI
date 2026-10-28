import { redirect } from "@tanstack/react-router";

type RedirectOptions = Parameters<typeof redirect>[0];

/**
 * Interrupts a route's `beforeLoad` or `loader` and navigates elsewhere.
 *
 * @remarks
 * TanStack Router redirects by throwing a Response-like object. `throw: true` lets the router
 * throw it itself, and the `never` return type tells TypeScript the code after the call does
 * not run.
 *
 * @param options - Redirect target, as accepted by `redirect()`.
 * @throws The router redirect, always.
 */
export function throwRedirect(options: RedirectOptions): never {
  redirect({ ...options, throw: true });
  throw new Error(`redirect() did not throw for ${String(options.to)}`);
}
