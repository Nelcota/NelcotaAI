import { createFileRoute } from "@tanstack/react-router";

import { CustomerGate, TopupHistoryPage } from "@/topups";

export const Route = createFileRoute("/_authenticated/recargas")({
  component: HistoryRoute,
});

function HistoryRoute() {
  return (
    <CustomerGate>
      {(customer) => (
        <TopupHistoryPage
          organizationId={customer.organizationId}
          isOrganizationBlocked={customer.isOrganizationBlocked}
        />
      )}
    </CustomerGate>
  );
}
