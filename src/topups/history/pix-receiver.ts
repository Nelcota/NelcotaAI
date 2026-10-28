import type { z } from "zod";

import type { pixSettingsSchema } from "../topups.schemas";
import type { PixReceiver } from "./pix-instructions";

/**
 * Extracts the receiving data from the settings.
 *
 * @param settings - The settings row, or undefined while it loads.
 * @returns The receiver, or null while any of key, name or city is missing (or blank).
 */
export function toPixReceiver(
  settings: z.infer<typeof pixSettingsSchema> | undefined,
): PixReceiver | null {
  const pixKey = settings?.pix_key?.trim() ?? "";
  const receiverName = settings?.pix_receiver_name?.trim() ?? "";
  const city = settings?.pix_city?.trim() ?? "";
  if (pixKey === "" || receiverName === "" || city === "") {
    return null;
  }
  return { pixKey, receiverName, city };
}
