import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { CompleteRegistration, currentProfileQuery } from "@/auth";
import { QueryErrorAlert } from "@/components/query-error-alert";
import { Skeleton } from "@/components/ui/skeleton";

/** The organization of a signed-in customer. */
export interface Customer {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationDocument: string;
  readonly isOrganizationBlocked: boolean;
}

/**
 * Renders customer pages only for accounts linked to an organization: platform admins go to
 * the admin area, and accounts without an organization are asked for their company.
 */
export function CustomerGate({
  children,
}: {
  readonly children: (customer: Customer) => ReactNode;
}) {
  const profile = useQuery(currentProfileQuery);

  if (profile.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (profile.isError) {
    return <QueryErrorAlert onRetry={() => void profile.refetch()} />;
  }
  if (profile.data?.is_platform_admin === true) {
    return <Navigate to="/admin" replace />;
  }
  const organization = profile.data?.organization;
  const organizationId = profile.data?.organization_id;
  if (organization == null || organizationId == null) {
    return <CompleteRegistration />;
  }

  return children({
    organizationId,
    organizationName: organization.name,
    organizationDocument: organization.document,
    isOrganizationBlocked: organization.status === "blocked",
  });
}
