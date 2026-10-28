import { createClient, type NelcotaClient } from "@nelcota/client";

import { browserEnv } from "./browser.env";
import type { Database } from "./database";

let browserClient: NelcotaClient<Database> | null = null;

/**
 * Returns the browser's Nelcota client, which keeps the signed-in session and refreshes it.
 *
 * @remarks
 * Created lazily because route modules are also imported during server rendering, and a
 * session-holding client must never be shared between server requests.
 *
 * @returns The single client for this browser tab.
 * @throws {Error} When called outside the browser.
 */
export function getNelcotaClient(): NelcotaClient<Database> {
  if (typeof window === "undefined") {
    throw new Error("getNelcotaClient() is browser-only; authenticated routes must use ssr: false");
  }
  browserClient ??= createClient<Database>(browserEnv.VITE_NELCOTA_URL);
  return browserClient;
}
