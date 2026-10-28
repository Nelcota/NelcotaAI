import { Badge } from "@/components/ui/badge";

import { type TopupStatus, describeTopupStatus } from "./topup-status";

// One colour per outcome: green when money was credited, brand orange while waiting, red when
// the request was refused, grey when the customer withdrew it.
const STATUS_TONE = {
  confirmed: "border-transparent bg-positive/15 text-positive",
  pending: "border-transparent bg-brand/15 text-brand",
  cancelled: "border-transparent bg-negative/15 text-negative",
  withdrawn: "border-transparent bg-secondary text-muted-foreground",
} as const satisfies Record<TopupStatus, string>;

/** Coloured label with the status of a top-up request. */
export function TopupStatusBadge({ status }: { readonly status: TopupStatus }) {
  return (
    <Badge variant="outline" className={STATUS_TONE[status]}>
      {describeTopupStatus(status)}
    </Badge>
  );
}
