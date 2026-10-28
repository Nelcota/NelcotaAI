import { createFileRoute } from "@tanstack/react-router";

import { throwRedirect } from "@/shared/redirect";

export const Route = createFileRoute("/")({
  beforeLoad: () => throwRedirect({ to: "/painel" }),
});
