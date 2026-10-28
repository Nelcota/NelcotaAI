import { Link, createFileRoute } from "@tanstack/react-router";

import { AuthLayout, signInWithEmailLink } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// Landing page of the magic link e-mail, whose URL is configured on the Nelcota server. On
// success the loader redirects to the dashboard; otherwise it returns the message to show.
export const Route = createFileRoute("/entrar")({
  ssr: false,
  loader: async () => ({ errorMessage: await signInWithEmailLink() }),
  pendingComponent: SigningIn,
  component: MagicLinkFailed,
});

function SigningIn() {
  return (
    <main className="flex min-h-svh items-center justify-center gap-2 p-4" aria-live="polite">
      <Spinner />
      Entrando…
    </main>
  );
}

function MagicLinkFailed() {
  const { errorMessage } = Route.useLoaderData();

  return (
    <AuthLayout
      title="Não foi possível entrar"
      description="O link de acesso não funcionou."
      footer={
        <Button variant="link" className="h-auto px-0 text-base text-brand" asChild>
          <Link to="/login">Voltar para o login</Link>
        </Button>
      }
    >
      <Alert variant="destructive">
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    </AuthLayout>
  );
}
