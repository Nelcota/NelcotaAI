import { createFileRoute } from "@tanstack/react-router";

import { CustomersPage } from "@/admin";

export const Route = createFileRoute("/_authenticated/admin/clientes/")({
  component: CustomersPage,
});
