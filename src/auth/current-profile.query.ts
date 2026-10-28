import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { getNelcotaClient } from "@/shared/nelcota";

import { loadSession } from "./session";

/**
 * Query for the signed-in user's profile and organization. Resolves to null when the account
 * exists in Nelcota but was not linked to an organization yet.
 */
export const currentProfileQuery = queryOptions({
  queryKey: ["current-profile"],
  queryFn: fetchCurrentProfile,
});

async function fetchCurrentProfile() {
  const session = await loadSession();
  if (session == null) {
    throw new Error("fetchCurrentProfile called without a session");
  }

  const { data: profile, error } = await getNelcotaClient()
    .from("profiles")
    .select(
      "name,role,is_platform_admin,organization_id,organization:organizations(name,document,status)",
    )
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error != null) {
    throw error;
  }
  return profile;
}

/** Refreshes membership after registration, cancelling profile reads started before the write completed. */
export async function refreshCurrentProfile(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: currentProfileQuery.queryKey });
  await queryClient.invalidateQueries({ queryKey: currentProfileQuery.queryKey });
}
