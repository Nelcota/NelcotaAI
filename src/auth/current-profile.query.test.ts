import { expect, test } from "bun:test";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { currentProfileQuery, refreshCurrentProfile } from "./current-profile.query";

test("registration replaces a profile read started before membership existed", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const previousRead = Promise.withResolvers<{ readonly name: string } | null>();
  let reads = 0;
  const options = {
    queryKey: currentProfileQuery.queryKey,
    queryFn: () => {
      reads++;
      return reads === 1 ? previousRead.promise : Promise.resolve({ name: "Registered account" });
    },
  };
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  const pending = client.fetchQuery(options).catch(() => null);

  await refreshCurrentProfile(client);
  previousRead.resolve(null);
  await pending;

  expect(observer.getCurrentResult().data).toEqual({ name: "Registered account" });
  expect(reads).toBe(2);
  unsubscribe();
  observer.destroy();
  client.clear();
});
