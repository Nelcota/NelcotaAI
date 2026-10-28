import { createFileRoute } from "@tanstack/react-router";

import { CustomerGate, HowItWorksPage } from "@/topups";

export const Route = createFileRoute("/_authenticated/como-funciona")({
  component: HowItWorksRoute,
});

function HowItWorksRoute() {
  return (
    <CustomerGate>
      {(customer) => <HowItWorksPage canRequestTopup={customer.isOrganizationBlocked === false} />}
    </CustomerGate>
  );
}
