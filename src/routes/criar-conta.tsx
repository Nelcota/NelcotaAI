import { Link, createFileRoute } from "@tanstack/react-router";

import { AuthLayout, SignUpForm, redirectIfSignedIn } from "@/auth";

export const Route = createFileRoute("/criar-conta")({
  // The session lives in browser storage, so auth pages render only in the browser.
  ssr: false,
  beforeLoad: redirectIfSignedIn,
  component: SignUpPage,
});

function SignUpPage() {
  return (
    <AuthLayout
      title="Crie sua conta"
      description="Cadastre sua empresa e comece a recarregar seus créditos por Pix."
      footer={
        <p className="text-center text-base">
          Já tem uma conta?{" "}
          <Link
            to="/login"
            className="rounded-sm font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Entrar
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthLayout>
  );
}
