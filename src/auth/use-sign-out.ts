import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";

import { getNelcotaClient } from "@/shared/nelcota";

/**
 * Returns a function that signs out and goes to the login page. The SDK emits a `signed_out`
 * event, and `SessionBoundary` resets the query cache so the next user never sees the previous
 * one's data.
 *
 * @returns The sign-out handler.
 */
export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate();

  return useCallback(async () => {
    const { error } = await getNelcotaClient().auth.signOut();
    if (error != null) {
      // The local session is cleared even when the server call fails; the access token simply
      // expires on its own. Tell the user but still leave the authenticated area.
      console.warn("sign-out request failed", error.code);
      toast.warning("Você saiu, mas não conseguimos avisar o servidor.");
    }
    await navigate({ to: "/login" });
  }, [navigate]);
}
