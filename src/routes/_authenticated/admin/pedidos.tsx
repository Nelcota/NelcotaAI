import { createFileRoute } from "@tanstack/react-router";

import { RequestHistoryPage } from "@/admin";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  component: RequestHistoryPage,
});
