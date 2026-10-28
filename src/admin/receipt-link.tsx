import { useMutation } from "@tanstack/react-query";
import { PaperclipIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getNelcotaClient } from "@/shared/nelcota";

// Short-lived link: enough to open the file, useless if it leaks later.
const SIGNED_URL_TTL_IN_SECONDS = 300;

/** Opens the customer's Pix receipt in a new tab through a short-lived signed link. */
export function ReceiptLink({ path }: { readonly path: string }) {
  const open = useMutation({
    mutationFn: async () => {
      // Opened before the request so browsers do not block it as a pop-up.
      const tab = window.open("about:blank", "_blank");
      const { data: url, error } = await getNelcotaClient()
        .storage.from("receipts")
        .createSignedUrl(path, SIGNED_URL_TTL_IN_SECONDS);
      if (error != null) {
        tab?.close();
        throw error;
      }
      if (tab == null) {
        window.location.assign(url);
        return;
      }
      tab.opener = null;
      tab.location.href = url;
    },
    onError: (error) => {
      console.warn("could not open receipt", error);
      toast.error("Não foi possível abrir o comprovante. Tente de novo.");
    },
  });

  return (
    <Button
      variant="link"
      size="sm"
      className="h-auto px-0 text-brand"
      disabled={open.isPending}
      onClick={() => open.mutate()}
    >
      {open.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <PaperclipIcon data-icon="inline-start" />
      )}
      Ver comprovante
    </Button>
  );
}
