/**
 * The first readable message among a form field's errors. TanStack Form keeps whatever the
 * validator returned: strings, or Standard Schema issues with a `message`.
 *
 * @param errors - The field's `state.meta.errors`.
 * @returns The first message, or null when none of the errors has one.
 */
export function firstErrorMessage(errors: readonly unknown[]): string | null {
  for (const error of errors) {
    const message = messageOf(error);
    if (message != null) {
      return message;
    }
  }
  return null;
}

function messageOf(error: unknown): string | null {
  const candidate: unknown =
    typeof error === "object" && error != null && "message" in error ? error.message : error;
  if (typeof candidate !== "string" || candidate.trim() === "") {
    return null;
  }
  return candidate;
}
