import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import {
  BanIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  type LucideIcon,
  PaperclipIcon,
} from "lucide-react";
import type { z } from "zod";

import { Money } from "@/components/money";
import { formatDateTime, formatMonthYear } from "@/shared/format";

import type { TopupStatus } from "../topup-status";
import { monthCreditTotalsQuery } from "../topups.queries";
import type { topupRequestSchema } from "../topups.schemas";
import { groupRequestsByMonth } from "./request-grouping";
import { TopupRequestActions } from "./topup-request-actions";
import { TopupStatusBadge } from "./topup-status-badge";

type TopupRequest = z.infer<typeof topupRequestSchema>;

const STATUS_ICON = {
  confirmed: { icon: CircleCheckIcon, tone: "bg-positive/15 text-positive" },
  pending: { icon: ClockIcon, tone: "bg-brand/15 text-brand" },
  cancelled: { icon: CircleXIcon, tone: "bg-negative/15 text-negative" },
  withdrawn: { icon: BanIcon, tone: "bg-secondary text-muted-foreground" },
} as const satisfies Record<TopupStatus, { icon: LucideIcon; tone: string }>;

interface RequestListProps {
  readonly organizationId: string;
  readonly requests: readonly TopupRequest[];
}

/** The customer's requests grouped by month, with what happened to each and its actions. */
export function RequestList({ organizationId, requests }: RequestListProps) {
  const groups = groupRequestsByMonth(requests);
  const credits = useQuery(
    monthCreditTotalsQuery(
      organizationId,
      groups.map((group) => group.month),
    ),
  );
  const totals = new Map(credits.data?.map((row) => [row.month, row.topup_cents]));

  return (
    <div className="flex flex-col gap-10">
      {groups.map((group) => {
        const headingId = `month-${group.month}`;
        return (
          <section key={group.month} aria-labelledby={headingId} className="flex flex-col">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
              <h3 id={headingId} className="text-lg font-semibold first-letter:uppercase">
                {formatMonthYear(group.month)}
              </h3>
              <p className="flex items-baseline gap-2 text-sm text-muted-foreground">
                Creditado no mês
                <Money
                  cents={credits.isSuccess ? (totals.get(group.month) ?? 0) : null}
                  className="text-base text-foreground"
                />
              </p>
            </div>
            <ul className="flex flex-col divide-y">
              {group.requests.map((request) => (
                <RequestItem key={request.id} organizationId={organizationId} request={request} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function RequestItem({
  organizationId,
  request,
}: {
  readonly organizationId: string;
  readonly request: TopupRequest;
}) {
  const { icon: Icon, tone } = STATUS_ICON[request.status];

  return (
    <li className="flex flex-col gap-4 py-5">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", tone)}
        >
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-base font-medium">Pedido de {formatDateTime(request.created_at)}</p>
          <RequestDetail request={request} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Money cents={request.amount_cents} className="text-xl" />
          <TopupStatusBadge status={request.status} />
        </div>
      </div>
      {request.status === "pending" && (
        <div className="sm:pl-15">
          <TopupRequestActions organizationId={organizationId} request={request} />
        </div>
      )}
    </li>
  );
}

const METHOD_LABELS = {
  manual_pix: "Pix",
  pix: "Pix",
  card: "cartão",
} as const satisfies Record<TopupRequest["payment_method"], string>;

function RequestDetail({ request }: { readonly request: TopupRequest }) {
  if (request.status === "confirmed" && request.decided_at != null) {
    return (
      <p className="text-sm text-muted-foreground">
        Creditado em {formatDateTime(request.decided_at)} · via{" "}
        {METHOD_LABELS[request.payment_method]}
      </p>
    );
  }
  if (request.status === "cancelled") {
    const prefix = request.payment_method === "manual_pix" ? "Recusado" : "Não concluído";
    return (
      <p className="text-sm text-muted-foreground">
        {prefix}
        {request.cancel_reason == null ? "" : `: ${request.cancel_reason}`}
      </p>
    );
  }
  if (request.status === "withdrawn") {
    return <p className="text-sm text-muted-foreground">Você cancelou este pedido.</p>;
  }
  if (request.payment_method === "card") {
    return (
      <p className="text-sm text-muted-foreground">Pagamento com cartão em análise pelo banco.</p>
    );
  }
  if (request.payment_method === "pix") {
    return <p className="text-sm text-muted-foreground">Aguardando o pagamento do Pix.</p>;
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {request.receipt_path == null ? (
        "Aguardando o pagamento por Pix."
      ) : (
        <>
          <PaperclipIcon aria-hidden="true" className="size-4" />
          Comprovante enviado. Estamos conferindo o pagamento.
        </>
      )}
    </p>
  );
}
