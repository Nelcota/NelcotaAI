import { useQuery } from "@tanstack/react-query";
import {
  CircleCheckIcon,
  CreditCardIcon,
  LockIcon,
  QrCodeIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader, SectionHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { MAX_INSTALLMENTS, PIX_EXPIRATION_IN_MINUTES } from "@/payments";
import { formatCents } from "@/shared/format";

import { RequestTopupDialog } from "./request-topup-dialog";
import { pixSettingsQuery } from "./topups.queries";

interface Step {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
}

const PAYMENT_METHODS: readonly Step[] = [
  {
    icon: QrCodeIcon,
    title: "Pix",
    description: "Crédito liberado em segundos, a qualquer hora, inclusive fins de semana.",
  },
  {
    icon: CreditCardIcon,
    title: "Cartão de crédito",
    description: `Em até ${MAX_INSTALLMENTS}x. O crédito entra assim que o pagamento é aprovado.`,
  },
  {
    icon: LockIcon,
    title: "Pagamento seguro",
    description: "Processado pelo Mercado Pago. Não guardamos os dados do seu cartão.",
  },
];

/** Step-by-step guide to top up, the payment methods and the common questions. */
export function HowItWorksPage({ canRequestTopup }: { readonly canRequestTopup: boolean }) {
  const settings = useQuery(pixSettingsQuery);
  const range =
    settings.data == null
      ? "o valor que precisar"
      : `de ${formatCents(settings.data.minimum_topup_cents)} a ${formatCents(settings.data.maximum_topup_cents)}`;
  const steps: readonly Step[] = [
    {
      icon: WalletIcon,
      title: "1. Escolha o valor",
      description: `Clique em "Nova recarga" e escolha ${range}.`,
    },
    {
      icon: QrCodeIcon,
      title: "2. Pague com Pix ou cartão",
      description: `Leia o QR Code no app do banco ou pague com cartão em até ${MAX_INSTALLMENTS}x.`,
    },
    {
      icon: CircleCheckIcon,
      title: "3. Crédito na hora",
      description: "Assim que o pagamento é aprovado, o crédito entra no seu saldo sozinho.",
    },
  ];

  return (
    <>
      <PageHeader
        title="Como funciona"
        description="Recarregar seus créditos de IA em três passos."
        actions={canRequestTopup ? <RequestTopupDialog /> : null}
      />
      <Panel>
        <ol className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {steps.map((step) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 py-4 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0"
            >
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-brand">
                <step.icon aria-hidden="true" className="size-4" />
              </span>
              <h2 className="font-medium">{step.title}</h2>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </Panel>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel className="flex flex-col gap-5">
          <SectionHeader title="Formas de pagamento" />
          <ul className="flex flex-col gap-4">
            {PAYMENT_METHODS.map((method) => (
              <li key={method.title} className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <method.icon aria-hidden="true" className="size-5" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium">{method.title}</p>
                  <p className="text-sm text-muted-foreground">{method.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="flex flex-col gap-5">
          <SectionHeader title="Dúvidas frequentes" />
          <dl className="flex flex-col divide-y">
            <FrequentQuestion question="Quanto tempo o crédito demora?">
              Com Pix, segundos depois do pagamento. Com cartão, assim que o banco aprova, em geral
              na hora.
            </FrequentQuestion>
            <FrequentQuestion question="Posso parcelar?">
              Sim, no cartão de crédito em até {MAX_INSTALLMENTS}x. Os juros do parcelamento são
              cobrados pela operadora do cartão; o crédito na sua conta é o valor da recarga.
            </FrequentQuestion>
            <FrequentQuestion question="Gerei um Pix e não paguei. E agora?">
              Tudo bem: nada é cobrado. O código expira em {PIX_EXPIRATION_IN_MINUTES} minutos e
              você pode gerar outro quando quiser.
            </FrequentQuestion>
            <FrequentQuestion question="Onde acompanho minhas recargas?">
              Em &quot;Recargas&quot;, no menu. Cada recarga mostra se está aguardando pagamento,
              creditada ou cancelada.
            </FrequentQuestion>
          </dl>
        </Panel>
      </div>
    </>
  );
}

function FrequentQuestion({
  question,
  children,
}: {
  readonly question: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-4 first:pt-0">
      <dt className="font-medium">{question}</dt>
      <dd className="text-sm text-muted-foreground">{children}</dd>
    </div>
  );
}
