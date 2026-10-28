import { createFileRoute } from "@tanstack/react-router";

import { handleMercadoPagoWebhookRequest } from "@/payments";

// Mercado Pago calls this address (notification_url) whenever a payment changes.
export const Route = createFileRoute("/api/mercado-pago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => await handleMercadoPagoWebhookRequest(request),
    },
  },
});
