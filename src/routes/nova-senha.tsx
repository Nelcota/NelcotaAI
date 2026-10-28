import { Link, createFileRoute } from "@tanstack/react-router";

import {
  AuthLayout,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  ResetPasswordForm,
  readRecoveryToken,
} from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Landing page of the password recovery e-mail, whose URL is configured on the Nelcota server.
export const Route = createFileRoute("/nova-senha")({
  ssr: false,
  // Read once in the loader: reading the link also strips the token from the address bar.
  loader: () => ({ token: readRecoveryToken() }),
  component: NewPasswordPage,
});

function NewPasswordPage() {
  const { token } = Route.useLoaderData();

  return (
    <AuthLayout
      title="Criar nova senha"
      description={`Escolha uma senha de ${MIN_PASSWORD_LENGTH} a ${MAX_PASSWORD_LENGTH} caracteres.`}
      footer={
        <Button variant="link" className="h-auto px-0 text-base text-brand" asChild>
          <Link to="/recuperar-senha">Pedir um novo link</Link>
        </Button>
      }
    >
      {token == null ? (
        <Alert variant="destructive">
          <AlertDescription>
            Este endereço não tem um link de recuperação válido. Peça um novo.
          </AlertDescription>
        </Alert>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </AuthLayout>
  );
}
