import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, BanIcon, CircleCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { KeyStat } from "@/components/key-stat";
import { Money } from "@/components/money";
import { Panel } from "@/components/panel";
import { QueryErrorAlert } from "@/components/query-error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeApiError } from "@/shared/api-error";
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatDocument,
  formatInteger,
} from "@/shared/format";
import { getNelcotaClient } from "@/shared/nelcota";

import { AdjustBalanceDialog } from "./adjust-balance-dialog";
import {
  ADMIN_QUERY_KEY,
  organizationLedgerQuery,
  organizationMembersQuery,
  organizationQuery,
} from "./admin.queries";
import { EditOrganizationDialog } from "./edit-organization-dialog";
import { LinkUserDialog } from "./link-user-dialog";
import { RemoveAccessDialog } from "./remove-access-dialog";

const LEDGER_TYPE_LABELS = { topup: "Recarga", adjustment: "Ajuste" } as const;

const ROLE_LABELS = { owner: "Responsável", member: "Membro" } as const;

/** One customer: balance, people with access, ledger and admin actions. */
export function CustomerDetailPage({ organizationId }: { readonly organizationId: string }) {
  const organization = useQuery(organizationQuery(organizationId));
  const members = useQuery(organizationMembersQuery(organizationId));

  if (organization.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (organization.isError) {
    return <QueryErrorAlert onRetry={() => void organization.refetch()} />;
  }
  if (organization.data == null) {
    return (
      <Empty className="rounded-[1.75rem] border bg-card">
        <EmptyHeader>
          <EmptyTitle>
            <h1>Empresa não encontrada</h1>
          </EmptyTitle>
          <EmptyDescription>
            <Link to="/admin/clientes" className="underline">
              Voltar para a lista de clientes
            </Link>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const customer = organization.data;
  const isBlocked = customer.status === "blocked";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="self-start rounded-full text-white hover:bg-white/15 hover:text-white"
        asChild
      >
        <Link to="/admin/clientes">
          <ArrowLeftIcon data-icon="inline-start" />
          Todos os clientes
        </Link>
      </Button>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 font-bold text-brand"
            >
              {customer.name.trim().at(0)?.toUpperCase() ?? "?"}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {customer.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatDocument(customer.document)} · cliente desde{" "}
                {formatDate(customer.created_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isBlocked ? "destructive" : "secondary"}>
              {isBlocked ? "Bloqueada" : "Ativa"}
            </Badge>
            <EditOrganizationDialog
              organizationId={organizationId}
              name={customer.name}
              document={customer.document}
            />
            <BlockToggleButton organizationId={organizationId} isBlocked={isBlocked} />
            <AdjustBalanceDialog organizationId={organizationId} />
          </div>
        </div>
        <dl className="mt-8 grid gap-6 sm:grid-cols-3">
          <KeyStat label="Saldo creditado">
            <Money cents={customer.balanceCents} />
          </KeyStat>
          <KeyStat label="Creditado no mês">
            <Money cents={customer.monthTopupCents} />
          </KeyStat>
          <KeyStat label="Pessoas com acesso">
            {members.data == null ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <span className="font-semibold tabular-nums">
                {formatInteger(members.data.length)}
              </span>
            )}
          </KeyStat>
        </dl>
      </Panel>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Pessoas com acesso</h2>
            <LinkUserDialog organizationId={organizationId} />
          </div>
          {members.isPending && <Skeleton className="h-24 w-full" />}
          {members.isError && <QueryErrorAlert onRetry={() => void members.refetch()} />}
          {members.isSuccess && members.data.length === 0 && (
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyTitle>Ninguém vinculado ainda</EmptyTitle>
                <EmptyDescription>
                  Crie o login no painel do Nelcota e use &quot;Vincular login&quot;.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {members.isSuccess && members.data.length > 0 && (
            <ul className="flex flex-col divide-y">
              {members.data.map((member) => (
                <li
                  key={member.user_id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[member.role]} · desde {formatDate(member.created_at)}
                    </p>
                  </div>
                  <RemoveAccessDialog userId={member.user_id} personName={member.name} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold tracking-tight">Extrato</h2>
          <Ledger organizationId={organizationId} />
        </Panel>
      </div>
    </>
  );
}

function Ledger({ organizationId }: { readonly organizationId: string }) {
  const ledger = useInfiniteQuery(organizationLedgerQuery(organizationId));

  if (ledger.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (ledger.isError) {
    return <QueryErrorAlert onRetry={() => void ledger.refetch()} />;
  }
  const entries = ledger.data.pages.flat();
  if (entries.length === 0) {
    return (
      <Empty className="py-6">
        <EmptyHeader>
          <EmptyTitle>Sem lançamentos</EmptyTitle>
          <EmptyDescription>Recargas confirmadas e ajustes aparecem aqui.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full">Descrição</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="max-w-0">
                  <p className="truncate">{entry.description}</p>
                  <p className="truncate text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{LEDGER_TYPE_LABELS[entry.type]}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCents(entry.amount_cents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {ledger.hasNextPage && (
        <Button
          variant="outline"
          disabled={ledger.isFetchingNextPage}
          onClick={() => void ledger.fetchNextPage()}
        >
          {ledger.isFetchingNextPage && <Spinner data-icon="inline-start" />}
          Carregar mais
        </Button>
      )}
    </div>
  );
}

interface BlockToggleButtonProps {
  readonly organizationId: string;
  readonly isBlocked: boolean;
}

function BlockToggleButton({ organizationId, isBlocked }: BlockToggleButtonProps) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await getNelcotaClient()
        .from("organizations")
        .update({ status: isBlocked ? "active" : "blocked" })
        .eq("id", organizationId);
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      toast.success(isBlocked ? "Empresa desbloqueada." : "Empresa bloqueada.");
      await queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY });
    },
    onError: (error) => toast.error(describeApiError(error)),
  });

  return (
    <Button variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
      {toggle.isPending && <Spinner data-icon="inline-start" />}
      {toggle.isPending === false &&
        (isBlocked ? (
          <CircleCheckIcon data-icon="inline-start" />
        ) : (
          <BanIcon data-icon="inline-start" />
        ))}
      {isBlocked ? "Desbloquear" : "Bloquear"}
    </Button>
  );
}
