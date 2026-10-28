import { Outlet, createFileRoute } from "@tanstack/react-router";

import { requirePlatformAdmin } from "@/admin";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: requirePlatformAdmin,
  component: Outlet,
});
