import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import {
  BuildingIcon,
  CircleHelpIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  ReceiptIcon,
  SettingsIcon,
} from "lucide-react";
import { useState } from "react";

import { describePendingRequestNotifications, pendingRequestsQuery } from "@/admin";
import {
  ChangePasswordDialog,
  currentProfileQuery,
  requireSession,
  sessionEmailQuery,
  useSignOut,
} from "@/auth";
import { AppShell, type NavigationItem } from "@/layout";
import {
  describePendingTopupNotifications,
  pendingTopupRequestsQuery,
  useTopupSynchronization,
  usePendingPaymentReconciliation,
} from "@/topups";

export const Route = createFileRoute("/_authenticated")({
  // The session lives in browser storage, so every authenticated page renders in the browser.
  // Authorization itself is enforced by RLS on every request, not by this guard.
  ssr: false,
  beforeLoad: requireSession,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const profile = useQuery(currentProfileQuery);
  const isAdmin = profile.data?.is_platform_admin === true;
  const pending = useQuery({ ...pendingRequestsQuery, enabled: isAdmin });
  const signOut = useSignOut();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const organizationId = profile.data?.organization_id ?? null;
  const pendingTopups = useQuery(pendingTopupRequestsQuery(organizationId));
  useTopupSynchronization(organizationId, pendingTopups.data);
  usePendingPaymentReconciliation(organizationId, pendingTopups.data);
  const email = useQuery(sessionEmailQuery);
  const adminPendingCount = pending.data?.length ?? 0;
  const customerPendingCount = pendingTopups.data?.length ?? 0;

  const items: readonly NavigationItem[] = isAdmin
    ? [
        {
          label: "Visão geral",
          to: "/admin",
          icon: LayoutDashboardIcon,
          hasNews: adminPendingCount > 0,
        },
        { label: "Pedidos", to: "/admin/pedidos", icon: ListChecksIcon },
        { label: "Clientes", to: "/admin/clientes", icon: BuildingIcon },
        { label: "Configurações", to: "/admin/configuracoes", icon: SettingsIcon },
      ]
    : [
        { label: "Visão geral", to: "/painel", icon: LayoutDashboardIcon },
        {
          label: "Recargas",
          to: "/recargas",
          icon: ReceiptIcon,
          hasNews: customerPendingCount > 0,
        },
        { label: "Como funciona", to: "/como-funciona", icon: CircleHelpIcon },
      ];

  return (
    <AppShell
      items={items}
      notifications={
        isAdmin
          ? {
              to: "/admin",
              label: "Ver pedidos pendentes",
              emptyMessage: "Nenhum pedido aguardando decisão.",
              items: describePendingRequestNotifications(pending.data ?? []),
            }
          : {
              to: "/recargas",
              label: "Ver minhas recargas",
              emptyMessage: "Nenhuma recarga aguardando confirmação.",
              items: describePendingTopupNotifications(pendingTopups.data ?? []),
            }
      }
      userName={profile.data?.name ?? null}
      userEmail={email.data ?? null}
      onSignOut={() => void signOut()}
      onChangePassword={() => setIsChangingPassword(true)}
    >
      <Outlet />
      <ChangePasswordDialog open={isChangingPassword} onOpenChange={setIsChangingPassword} />
    </AppShell>
  );
}
