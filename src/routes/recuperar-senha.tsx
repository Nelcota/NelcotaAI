import { Link, createFileRoute } from "@tanstack/react-router";

import { AuthLayout, EmailRequestForm } from "@/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/recuperar-senha")({
  ssr: false,
  component: PasswordRecoveryPage,
});

function PasswordRecoveryPage() {
  return (
    <AuthLayout
      title="Recuperar senha"
      description="Enviaremos um link para você criar uma nova senha."
      footer={
        <Button variant="link" className="h-auto px-0 text-base text-brand" asChild>
          <Link to="/login">Voltar para o login</Link>
        </Button>
      }
    >
      <EmailRequestForm purpose="password_recovery" />
    </AuthLayout>
  );
}
