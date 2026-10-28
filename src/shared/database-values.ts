import { z } from "zod";

/**
 * A Postgres `bigint` as sent by the SDK: a number, or a string when it does not fit a safe
 * integer. Amounts beyond `Number.MAX_SAFE_INTEGER` are rejected instead of rounded.
 */
export const bigintSchema = z
  .union([z.number(), z.string().regex(/^-?\d+$/)])
  .transform(Number)
  .pipe(z.number().int());
