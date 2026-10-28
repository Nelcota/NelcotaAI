import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { InitialAvatar } from "@/components/initial-avatar";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDocument, formatInteger } from "@/shared/format";

import { RequestTopupDialog } from "./request-topup-dialog";
import { organizationBalanceQuery } from "./topups.queries";

interface CompanyPanelProps {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationDocument: string;
  readonly isOrganizationBlocked: boolean;
  readonly pendingCount: number | null;
}

/** Right-hand card: the company, its balance and quick facts. */
export function CompanyPanel({
  organizationId,
  organizationName,
  organizationDocument,
  isOrganizationBlocked,
  pendingCount,
}: CompanyPanelProps) {
  const balance = useQuery(organizationBalanceQuery(organizationId));
  const lastCredit = balance.data?.last_credit_cents ?? null;
  const lastCreditAt = balance.data?.last_credit_at ?? null;

  return (
    <Panel className="flex flex-col gap-6" label="Sua empresa">
      <div className="flex items-center gap-3">
        <InitialAvatar name={organizationName} className="size-11 rounded-2xl text-sm font-bold" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{organizationName}</p>
          <p className="text-xs text-muted-foreground">{formatDocument(organizationDocument)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1 rounded-2xl border bg-secondary/40 px-4 py-3">
        <p className="text-xs text-muted-foreground">Saldo creditado</p>
        <Money cents={balance.data?.balance_cents ?? null} className="text-2xl" />
      </div>
      <Link
        to="/recargas"
        className="flex items-center gap-1 self-start rounded-sm text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Ver todas as recargas
        <ArrowUpRightIcon aria-hidden="true" className="size-4 text-brand" />
      </Link>
      <dl className="flex flex-col gap-3 text-sm">
        <Fact label="Situação da conta">
          {isOrganizationBlocked ? (
            <span className="font-medium text-negative">Bloqueada</span>
          ) : (
            <span className="font-medium text-positive">Ativa</span>
          )}
        </Fact>
        <Fact label="Último crédito">
          {balance.isPending && <Skeleton className="h-4 w-20" />}
          {balance.isSuccess && (lastCreditAt == null ? "—" : formatDate(lastCreditAt))}
        </Fact>
        <Fact label="Valor do último crédito">
          {lastCredit == null ? "—" : <Money cents={lastCredit} className="text-sm" />}
        </Fact>
        <Fact label="Pedidos pendentes">
          {pendingCount == null ? "—" : formatInteger(pendingCount)}
        </Fact>
      </dl>
      {isOrganizationBlocked === false && <RequestTopupDialog trigger="outline" />}
    </Panel>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}
