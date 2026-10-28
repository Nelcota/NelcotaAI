import { Link, createFileRoute } from "@tanstack/react-router";
import { KeyRoundIcon, MailIcon } from "lucide-react";
import { useState } from "react";

import { AuthLayout, EmailRequestForm, SignInForm, redirectIfSignedIn } from "@/auth";

export const Route = createFileRoute("/login")({
  // The session lives in browser storage, so auth pages render only in the browser.
  ssr: false,
  beforeLoad: redirectIfSignedIn,
  component: LoginPage,
});

type SignInMethod = "password" | "magic-link";

function LoginPage() {
  const [method, setMethod] = useState<SignInMethod>("password");
  const isPassword = method === "password";

  return (
    <AuthLayout
      title="Bem-vindo de volta"
      description={
        isPassword
          ? "Entre com o e-mail e a senha da sua empresa."
          : "Enviaremos um link de acesso para o seu e-mail."
      }
      footer={
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs tracking-wide uppercase">ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            onClick={() => setMethod(isPassword ? "magic-link" : "password")}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border text-base font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {isPassword ? (
              <MailIcon aria-hidden="true" className="size-5" />
            ) : (
              <KeyRoundIcon aria-hidden="true" className="size-5" />
            )}
            {isPassword ? "Entrar com link por e-mail" : "Entrar com senha"}
          </button>
          <p className="pt-2 text-center text-base">
            Ainda não tem conta?{" "}
            <Link
              to="/criar-conta"
              className="rounded-sm font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Criar conta
            </Link>
          </p>
        </div>
      }
    >
      {isPassword ? <SignInForm /> : <EmailRequestForm purpose="magic_link" />}
    </AuthLayout>
  );
}
