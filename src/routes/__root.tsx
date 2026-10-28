import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

import { SessionBoundary } from "@/auth";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, ThemedToaster } from "@/layout";

import appCss from "@/shared/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Nelcota AI" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  errorComponent: ErrorPage,
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // next-themes applies the saved theme before hydration.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <SessionBoundary>
            <TooltipProvider>{children}</TooltipProvider>
            <ThemedToaster />
          </SessionBoundary>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-2 p-6 pt-16">
      <h1 className="font-heading text-xl font-medium">Página não encontrada</h1>
      <p className="text-muted-foreground">O endereço que você acessou não existe.</p>
      <Button variant="link" className="px-0 text-brand" asChild>
        <Link to="/painel">Voltar ao painel</Link>
      </Button>
    </main>
  );
}

function ErrorPage({ error }: { error: unknown }) {
  useEffect(() => {
    console.error("unhandled route error", error);
  }, [error]);
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-2 p-6 pt-16">
      <h1 className="font-heading text-xl font-medium">Algo deu errado</h1>
      <p className="text-muted-foreground">
        Não foi possível abrir esta página. Verifique sua conexão e tente de novo.
      </p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Recarregar a página
      </Button>
    </main>
  );
}
