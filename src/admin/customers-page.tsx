import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BuildingIcon, SearchIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { QueryErrorAlert } from "@/components/query-error-alert";
import { SegmentedControl } from "@/components/segmented-control";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents, formatDocument } from "@/shared/format";

import { organizationsQuery } from "./admin.queries";
import {
  CUSTOMER_STATUS_OPTIONS,
  type CustomerStatusFilter,
  filterCustomers,
} from "./customer-filters";
import { NewOrganizationDialog } from "./new-organization-dialog";

const MAX_SEARCH_LENGTH = 100;

/** Customer list with search by name or CPF/CNPJ and a situation filter. */
export function CustomersPage() {
  const organizations = useQuery(organizationsQuery);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CustomerStatusFilter>("all");
  const deferredSearch = useDeferredValue(search);

  const isFiltering = deferredSearch.trim() !== "" || status !== "all";
  const visible = filterCustomers(organizations.data ?? [], deferredSearch, status);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Empresas cadastradas, saldo creditado e situação."
        actions={<NewOrganizationDialog />}
      />
      <Panel className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex w-full max-w-sm flex-col gap-2">
            <Label htmlFor="customer-search" className="sr-only">
              Buscar por nome ou CPF/CNPJ
            </Label>
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id="customer-search"
                type="search"
                placeholder="Buscar por nome ou CPF/CNPJ"
                maxLength={MAX_SEARCH_LENGTH}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
          </div>
          <SegmentedControl
            label="Situação"
            options={CUSTOMER_STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
          />
        </div>
        {organizations.isPending && <Skeleton className="h-64 w-full" />}
        {organizations.isError && <QueryErrorAlert onRetry={() => void organizations.refetch()} />}
        {organizations.isSuccess && visible.length === 0 && (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BuildingIcon />
              </EmptyMedia>
              <EmptyTitle>{isFiltering ? "Nada encontrado" : "Nenhuma empresa ainda"}</EmptyTitle>
              <EmptyDescription>
                {isFiltering
                  ? "Nenhuma empresa corresponde aos filtros."
                  : 'Use "Nova empresa" para cadastrar o primeiro cliente.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {organizations.isSuccess && visible.length > 0 && (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full">Empresa</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Saldo creditado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((organization) => (
                  <TableRow key={organization.id}>
                    <TableCell className="max-w-0">
                      <Link
                        to="/admin/clientes/$organizationId"
                        params={{ organizationId: organization.id }}
                        className="block truncate font-medium hover:underline"
                      >
                        {organization.name}
                      </Link>
                      <p className="truncate text-muted-foreground">
                        {formatDocument(organization.document)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={organization.status === "active" ? "secondary" : "destructive"}
                      >
                        {organization.status === "active" ? "Ativa" : "Bloqueada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(organization.balanceCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}
