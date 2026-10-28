import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { PaymentsNotConfiguredError } from "./payments.errors";

const serverEnvSchema = {
  VITE_NELCOTA_URL: z.url({ protocol: /^https?$/ }),
  NELCOTA_SERVICE_ROLE_TOKEN: z.string().min(1),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(1),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(1),
  APP_URL: z.url({ protocol: /^https?$/ }),
};

type PaymentsEnv = {
  readonly [Key in keyof typeof serverEnvSchema]: z.output<(typeof serverEnvSchema)[Key]>;
};

let cachedEnv: PaymentsEnv | null = null;

/**
 * Reads and validates the server secrets of the payment flow.
 *
 * @remarks
 * Validated on first use instead of at startup, so the rest of the app keeps working in
 * development before the Mercado Pago credentials exist. Server only: never import it from
 * code that runs in the browser.
 *
 * @returns The validated variables.
 * @throws {PaymentsNotConfiguredError} When a variable is missing or invalid (names only).
 */
export function readPaymentsEnv(): PaymentsEnv {
  if (cachedEnv != null) {
    return cachedEnv;
  }
  try {
    cachedEnv = createEnv({
      server: serverEnvSchema,
      runtimeEnv: process.env,
      emptyStringAsUndefined: true,
      isServer: true,
    });
  } catch (error) {
    throw new PaymentsNotConfiguredError(error);
  }
  return cachedEnv;
}
