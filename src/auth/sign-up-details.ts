import { queryOptions } from "@tanstack/react-query";

import { loadSession } from "./session";

/** Company details typed at sign-up, used only to pre-fill the "complete registration" form. */
interface SignUpDetails {
  readonly name: string;
  readonly organizationName: string;
  readonly document: string;
}

/**
 * Reads the details saved in the user metadata at sign-up. The metadata is written by the
 * user, so it is only a suggestion: the form validates it again before sending.
 *
 * @param metadata - The account's `user_metadata`.
 * @returns The details, with an empty string for anything missing or not a string.
 */
export function readSignUpDetails(metadata: Readonly<Record<string, unknown>>): SignUpDetails {
  return {
    name: stringOrEmpty(metadata["name"]),
    organizationName: stringOrEmpty(metadata["organization_name"]),
    document: stringOrEmpty(metadata["document"]),
  };
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Query for the sign-up details of the signed-in account, read from the stored session. */
export const signUpDetailsQuery = queryOptions({
  queryKey: ["sign-up-details"],
  queryFn: async () => {
    const session = await loadSession();
    return readSignUpDetails(session?.user.user_metadata ?? {});
  },
});
