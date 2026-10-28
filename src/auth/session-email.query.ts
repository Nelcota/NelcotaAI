import { queryOptions } from "@tanstack/react-query";

import { loadSession } from "./session";

/** E-mail of the signed-in account, read from the stored session (no extra request). */
export const sessionEmailQuery = queryOptions({
  queryKey: ["session-email"],
  queryFn: async () => {
    const session = await loadSession();
    return session?.user.email ?? null;
  },
});
