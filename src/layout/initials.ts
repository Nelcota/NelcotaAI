/**
 * Initials shown in the avatar of a user: the first letter of the first and last words of
 * the name, in upper case.
 *
 * @param name - Display name of the user, or null while it loads.
 * @returns One or two upper-case letters, or "?" when there is no name.
 *
 * @example
 * initialsOf("Maria da Silva"); // "MS"
 */
export function initialsOf(name: string | null): string {
  if (name == null || name.trim() === "") {
    return "?";
  }
  const words = name.trim().split(/\s+/);
  const first = words.at(0)?.at(0) ?? "";
  const last = words.length > 1 ? (words.at(-1)?.at(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
}
