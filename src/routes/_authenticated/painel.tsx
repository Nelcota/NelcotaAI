import { createFileRoute } from "@tanstack/react-router";

import { CustomerGate, TopupOverviewPage } from "@/topups";

export const Route = createFileRoute("/_authenticated/painel")({
  component: OverviewRoute,
});

function OverviewRoute() {
  return <CustomerGate>{(customer) => <TopupOverviewPage {...customer} />}</CustomerGate>;
}
