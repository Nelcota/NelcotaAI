import { createHmac, timingSafeEqual } from "node:crypto";

// Mercado Pago retries a notification for a while; older ones are rejected as replays.
const MAX_SIGNATURE_AGE_IN_SECONDS = 600;
const MS_PER_SECOND = 1000;

/** What a webhook request carries for the signature check. */
interface SignedNotification {
  /** The `x-signature` header, such as `ts=1704908010,v1=618c…`. */
  readonly signatureHeader: string | null;
  /** The `x-request-id` header. */
  readonly requestId: string | null;
  /** The `data.id` query parameter. */
  readonly dataId: string | null;
}

/**
 * Checks a Mercado Pago webhook signature: HMAC-SHA256 of
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` with the webhook secret, compared in
 * constant time, and a timestamp no older than 10 minutes.
 *
 * @param notification - Headers and query parameter of the request.
 * @param secret - The webhook secret from the Mercado Pago panel.
 * @param now - Current instant, for the replay window.
 * @returns True when the signature is valid and recent.
 */
export function isValidWebhookSignature(
  notification: SignedNotification,
  secret: string,
  now: Date,
): boolean {
  const parts = parseSignatureHeader(notification.signatureHeader ?? "");
  const timestamp = parts.get("ts");
  const signature = parts.get("v1");
  if (timestamp == null || signature == null || secret === "") {
    return false;
  }
  const ageInSeconds = Math.abs(now.getTime() - Number(timestamp) * MS_PER_SECOND) / MS_PER_SECOND;
  if (Number.isFinite(ageInSeconds) === false || ageInSeconds > MAX_SIGNATURE_AGE_IN_SECONDS) {
    return false;
  }
  const manifest = buildManifest(notification, timestamp);
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  return safeEqual(expected, signature);
}

function parseSignatureHeader(header: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      parts.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim());
    }
  }
  return parts;
}

/** Same manifest as the official SDKs: missing values are left out. */
function buildManifest(notification: SignedNotification, timestamp: string): string {
  const parts: string[] = [];
  if (notification.dataId != null && notification.dataId !== "") {
    parts.push(`id:${notification.dataId}`);
  }
  if (notification.requestId != null && notification.requestId !== "") {
    parts.push(`request-id:${notification.requestId}`);
  }
  parts.push(`ts:${timestamp}`);
  return `${parts.join(";")};`;
}

function safeEqual(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  if (expectedBytes.length !== receivedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, receivedBytes);
}
