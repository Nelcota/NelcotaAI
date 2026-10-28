import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/admin";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: SettingsPage,
});
