import { getNelcotaClient } from "@/shared/nelcota";
import { throwRedirect } from "@/shared/redirect";

/**
 * Route guard for the admin area: sends anyone who is not a platform admin to the dashboard.
 *
 * @remarks
 * This only spares customers an empty screen. The real protection is in the database: RLS and
 * the admin functions check `is_platform_admin()` on every request.
 *
 * @throws A router redirect to `/painel` when the caller is not a platform admin.
 * @throws {NelcotaError} When the check itself fails (network, expired session).
 */
export async function requirePlatformAdmin(): Promise<void> {
  const { data, error } = await getNelcotaClient().rpc("is_platform_admin", {});
  if (error != null) {
    throw error;
  }
  if (data !== true) {
    throwRedirect({ to: "/painel" });
  }
}
