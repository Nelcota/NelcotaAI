import { useQuery } from "@tanstack/react-query";

import { Panel } from "@/components/panel";
import { QueryErrorAlert } from "@/components/query-error-alert";
import { Skeleton } from "@/components/ui/skeleton";

import { CompleteRegistrationForm } from "./complete-registration-form";
import { signUpDetailsQuery } from "./sign-up-details";

/**
 * Shown to a signed-in account that has no organization yet: after confirming the e-mail, or
 * when the company could not be created right after sign-up.
 */
export function CompleteRegistration() {
  return (
    <Panel className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Conclua o cadastro</h1>
        <p className="text-base text-muted-foreground">
          Confirme os dados da sua empresa para começar a pedir recargas.
        </p>
      </header>
      <RegistrationBody />
    </Panel>
  );
}

function RegistrationBody() {
  const details = useQuery(signUpDetailsQuery);

  if (details.isPending) {
    return <Skeleton className="h-72 w-full rounded-2xl" />;
  }
  if (details.isError) {
    return <QueryErrorAlert onRetry={() => void details.refetch()} />;
  }
  return <CompleteRegistrationForm initialValues={details.data} />;
}
