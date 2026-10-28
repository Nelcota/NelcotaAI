import { QrCodeIcon, ReceiptTextIcon, ShieldCheckIcon } from "lucide-react";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  /** Small text or links under the form. */
  readonly footer?: ReactNode;
}

const BENEFITS = [
  { icon: QrCodeIcon, text: "Recarga por Pix" },
  { icon: ReceiptTextIcon, text: "Histórico de pedidos" },
  { icon: ShieldCheckIcon, text: "Acesso exclusivo" },
] as const;

/**
 * Sign-in screens: a single centered column over the brand gradient.
 * Shared by every auth page (login, sign-up, recovery, new password, magic link landing).
 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative isolate flex min-h-svh flex-col items-center overflow-hidden bg-background px-5 py-8 sm:px-8">
      <div aria-hidden="true" className="hero-gradient absolute inset-x-0 top-0 -z-10 h-[26rem]" />
      <img
        src="/brand/nelcota-logo.svg"
        alt="Nelcota"
        width={149}
        height={40}
        className="h-10 w-auto"
      />
      <main className="flex w-full flex-1 flex-col items-center justify-center gap-8 py-10">
        <div className="flex w-full max-w-[28rem] flex-col gap-8 rounded-[2rem] border border-white/10 bg-background/85 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-base text-muted-foreground">{description}</p>
          </header>
          {children}
          {footer != null && <div className="text-sm text-muted-foreground">{footer}</div>}
        </div>
        <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {BENEFITS.map((benefit) => (
            <li
              key={benefit.text}
              className="flex items-center gap-2.5 text-base text-muted-foreground"
            >
              <benefit.icon aria-hidden="true" className="size-5 text-foreground" />
              {benefit.text}
            </li>
          ))}
        </ul>
      </main>
      <p className="text-center text-xs text-muted-foreground">
        Problemas para entrar? Fale com o suporte da Nelcota.
      </p>
    </div>
  );
}
