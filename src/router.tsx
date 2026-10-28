import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

// Dashboard data changes only when the user acts or a payment lands; 30 s avoids refetching
// the same data on every navigation while still refreshing on window focus.
const QUERY_STALE_TIME_IN_MS = 30_000;

/**
 * Creates the application router. TanStack Start calls this once per request on the server
 * and once in the browser, so each gets its own query cache.
 *
 * @returns The router configured with the generated route tree and a TanStack Query client.
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: QUERY_STALE_TIME_IN_MS } },
  });

  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
