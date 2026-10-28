import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shown in place of a section whose data failed to load, with a retry button. */
export function QueryErrorAlert({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Não foi possível carregar estes dados.</AlertTitle>
      <AlertDescription>Verifique sua conexão e tente de novo.</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      </AlertAction>
    </Alert>
  );
}
