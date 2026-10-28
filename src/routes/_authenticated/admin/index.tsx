import { createFileRoute } from "@tanstack/react-router";

import { AdminOverviewPage } from "@/admin";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverviewPage,
});
