import { createFileRoute } from "@tanstack/react-router";

import { CustomerDetailPage } from "@/admin";

export const Route = createFileRoute("/_authenticated/admin/clientes/$organizationId")({
  component: CustomerRoute,
});

function CustomerRoute() {
  const { organizationId } = Route.useParams();
  return <CustomerDetailPage organizationId={organizationId} />;
}
