import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variables that are safe to ship to the browser. Vite only exposes variables
 * prefixed with `VITE_`, so server secrets can never land here by accident.
 */
export const browserEnv = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_NELCOTA_URL: z.url({ protocol: /^https?$/ }),
    // Public key of the Mercado Pago card form. Optional: without it, only Pix is offered.
    VITE_MERCADO_PAGO_PUBLIC_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
