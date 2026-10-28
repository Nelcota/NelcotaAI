import { describe, expect, test } from "bun:test";

import { toPixReceiver } from "./pix-receiver";

const settings = {
  pix_key: " financeiro@example.com ",
  pix_receiver_name: "Nelcota AI Ltda",
  pix_city: "SAO PAULO",
  minimum_topup_cents: 2000,
  maximum_topup_cents: 500000,
};

describe("toPixReceiver", () => {
  test("returns the trimmed receiving data", () => {
    const receiver = toPixReceiver(settings);

    expect(receiver).toEqual({
      pixKey: "financeiro@example.com",
      receiverName: "Nelcota AI Ltda",
      city: "SAO PAULO",
    });
  });

  test("returns null while the city is missing", () => {
    const receiver = toPixReceiver({ ...settings, pix_city: null });

    expect(receiver).toBeNull();
  });

  test("returns null when the key is blank", () => {
    const receiver = toPixReceiver({ ...settings, pix_key: "   " });

    expect(receiver).toBeNull();
  });

  test("returns null while the settings load", () => {
    const receiver = toPixReceiver(undefined);

    expect(receiver).toBeNull();
  });
});
