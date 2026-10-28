import { expect, test } from "bun:test";

import type { Session } from "@nelcota/client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { sessionCacheListener } from "./session-cache";

function session(id: string): Session {
  return {
    access_token: "test-token",
    refresh_token: "test-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 1798800000,
    user: {
      id,
      email: `${id}@example.com`,
      created_at: "2026-01-01T00:00:00Z",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      last_sign_in_at: null,
      user_metadata: {},
    },
  };
}

test("account replacement clears cached profile, email, and financial data", async () => {
  const client = new QueryClient();
  let invalidations = 0;
  const listener = sessionCacheListener(client, () => {
    invalidations++;
    return Promise.resolve();
  });
  await listener("signed_in", session("account-a"));
  client.setQueryData(["current-profile"], { name: "Account A" });
  client.setQueryData(["session-email"], "account-a@example.com");
  client.setQueryData(["topups", "monthly", 24], [{ topup_cents: 9000 }]);

  await listener("signed_in", session("account-b"));

  expect(client.getQueryCache().getAll()).toEqual([]);
  expect(invalidations).toBe(2);
  client.clear();
});

test("token refresh for the same account retains its cache", async () => {
  const client = new QueryClient();
  const listener = sessionCacheListener(client, () => Promise.resolve());
  await listener("signed_in", session("account-a"));
  client.setQueryData(["current-profile"], { name: "Account A" });

  await listener("refreshed", session("account-a"));

  expect(client.getQueryData<{ name: string }>(["current-profile"])).toEqual({ name: "Account A" });
  client.clear();
});

test("an old in-flight result cannot repopulate the cache after account replacement", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const listener = sessionCacheListener(client, () => Promise.resolve());
  await listener("signed_in", session("account-a"));
  const response = Promise.withResolvers<string>();
  const oldRequest = client
    .fetchQuery({ queryKey: ["private-data"], queryFn: () => response.promise })
    .catch(() => null);

  await listener("signed_in", session("account-b"));
  response.resolve("Account A private data");
  await oldRequest;

  expect(client.getQueryData(["private-data"])).toBeUndefined();
  client.clear();
});

test("the first refresh of a restored account preserves its mounted view", async () => {
  const client = new QueryClient();
  client.setQueryData(["current-profile"], { name: "Restored account" });
  let replacements = 0;
  const listener = sessionCacheListener(client, () => {
    replacements++;
    return Promise.resolve();
  });

  await listener("refreshed", session("account-a"));

  expect(replacements).toBe(0);
  expect(client.getQueryData<{ name: string }>(["current-profile"])).toEqual({
    name: "Restored account",
  });
  client.clear();
});

test("replacing a mounted query view loads the new account despite a fresh static query key", async () => {
  const client = new QueryClient();
  let account = "account-a";
  const options = {
    queryKey: ["current-profile"],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => Promise.resolve({ name: account }),
  };
  let observer = new QueryObserver(client, options);
  let unsubscribe = observer.subscribe(() => {});
  await client.fetchQuery(options);
  const listener = sessionCacheListener(client, async () => {
    unsubscribe();
    observer.destroy();
    observer = new QueryObserver(client, options);
    unsubscribe = observer.subscribe(() => {});
    await client.fetchQuery(options);
  });
  await listener("signed_in", session("account-a"));

  account = "account-b";
  await listener("signed_in", session("account-b"));

  expect(observer.getCurrentResult().data).toEqual({ name: "account-b" });
  unsubscribe();
  observer.destroy();
  client.clear();
});
