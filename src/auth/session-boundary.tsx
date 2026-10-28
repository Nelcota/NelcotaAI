import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Fragment, useEffect, useState, type ReactNode } from "react";

import { getNelcotaClient } from "@/shared/nelcota";

import { sessionCacheListener } from "./session-cache";

/**
 * Remounts account-owned UI on identity changes, including email-link callbacks.
 *
 * @param props - Route content whose queries and local checkout state belong to the current session.
 * @returns A session-keyed subtree with no data or component state retained from the previous account.
 */
export function SessionBoundary({ children }: { readonly children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    const listener = sessionCacheListener(queryClient, async () => {
      // clear() alone leaves mounted QueryObservers attached to their previous result.
      setRevision((current) => current + 1);
      await router.invalidate();
    });
    return getNelcotaClient().auth.onChange((event, session) => {
      void listener(event, session).catch((error: unknown) =>
        console.error("session cache reset failed", error),
      );
    });
  }, [queryClient, router]);
  return <Fragment key={revision}>{children}</Fragment>;
}
