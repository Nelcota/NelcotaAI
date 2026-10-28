import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

import { isValidWebhookSignature } from "./webhook-signature";

const SECRET = "test-webhook-secret";
const TIMESTAMP = "1793138400";
const NOW = new Date(Number(TIMESTAMP) * 1000);

function sign(manifest: string): string {
  return createHmac("sha256", SECRET).update(manifest).digest("hex");
}

const VALID_HASH = sign(`id:123456;request-id:req-1;ts:${TIMESTAMP};`);

describe("isValidWebhookSignature", () => {
  test("accepts a signature made with the secret", () => {
    const notification = {
      signatureHeader: `ts=${TIMESTAMP},v1=${VALID_HASH}`,
      requestId: "req-1",
      dataId: "123456",
    };

    const isValid = isValidWebhookSignature(notification, SECRET, NOW);

    expect(isValid).toBe(true);
  });

  test("accepts spaces around the header parts", () => {
    const notification = {
      signatureHeader: ` ts=${TIMESTAMP} , v1=${VALID_HASH} `,
      requestId: "req-1",
      dataId: "123456",
    };

    const isValid = isValidWebhookSignature(notification, SECRET, NOW);

    expect(isValid).toBe(true);
  });

  test("rejects a different payment id", () => {
    const notification = {
      signatureHeader: `ts=${TIMESTAMP},v1=${VALID_HASH}`,
      requestId: "req-1",
      dataId: "999999",
    };

    const isValid = isValidWebhookSignature(notification, SECRET, NOW);

    expect(isValid).toBe(false);
  });

  test("rejects a signature made with another secret", () => {
    const notification = {
      signatureHeader: `ts=${TIMESTAMP},v1=${VALID_HASH}`,
      requestId: "req-1",
      dataId: "123456",
    };

    const isValid = isValidWebhookSignature(notification, "other-secret", NOW);

    expect(isValid).toBe(false);
  });

  test("rejects a notification older than 10 minutes", () => {
    const notification = {
      signatureHeader: `ts=${TIMESTAMP},v1=${VALID_HASH}`,
      requestId: "req-1",
      dataId: "123456",
    };
    const elevenMinutesLater = new Date(NOW.getTime() + 11 * 60_000);

    const isValid = isValidWebhookSignature(notification, SECRET, elevenMinutesLater);

    expect(isValid).toBe(false);
  });

  test("rejects a missing header", () => {
    const notification = { signatureHeader: null, requestId: "req-1", dataId: "123456" };

    const isValid = isValidWebhookSignature(notification, SECRET, NOW);

    expect(isValid).toBe(false);
  });

  test("rejects a header without the hash", () => {
    const notification = {
      signatureHeader: `ts=${TIMESTAMP}`,
      requestId: "req-1",
      dataId: "123456",
    };

    const isValid = isValidWebhookSignature(notification, SECRET, NOW);

    expect(isValid).toBe(false);
  });

  test("rejects a timestamp that is not a number", () => {
    const notification = {
      signatureHeader: `ts=abc,v1=${VALID_HASH}`,
      requestId: "req-1",
      dataId: "123456",
    };

    const isValid = isValidWebhookSignature(notification, SECRET, NOW);

    expect(isValid).toBe(false);
  });

  test("leaves the request id out of the manifest when it is missing", () => {
    const hash = sign(`id:123456;ts:${TIMESTAMP};`);
    const notification = {
      signatureHeader: `ts=${TIMESTAMP},v1=${hash}`,
      requestId: null,
      dataId: "123456",
    };

    const isValid = isValidWebhookSignature(notification, SECRET, NOW);

    expect(isValid).toBe(true);
  });

  test("rejects everything when the secret is empty", () => {
    const notification = {
      signatureHeader: `ts=${TIMESTAMP},v1=${VALID_HASH}`,
      requestId: "req-1",
      dataId: "123456",
    };

    const isValid = isValidWebhookSignature(notification, "", NOW);

    expect(isValid).toBe(false);
  });
});
