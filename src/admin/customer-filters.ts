/** Situation filter of the customer list: every organization, or one status. */
export type CustomerStatusFilter = "all" | "active" | "blocked";

export const CUSTOMER_STATUS_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Ativas" },
  { value: "blocked", label: "Bloqueadas" },
] as const satisfies readonly { value: CustomerStatusFilter; label: string }[];

interface FilterableCustomer {
  readonly name: string;
  readonly document: string;
  readonly status: "active" | "blocked";
}

/**
 * Keeps the customers that match the search and the situation filter.
 *
 * @param customers - Organizations as the admin list reads them.
 * @param search - Free text typed by the admin: part of the name (case-insensitive) or digits
 * of the CPF/CNPJ, punctuation ignored. Blank keeps every organization.
 * @param status - Situation to keep, or `all`.
 * @returns The matching customers, in the original order.
 */
export function filterCustomers<Customer extends FilterableCustomer>(
  customers: readonly Customer[],
  search: string,
  status: CustomerStatusFilter,
): Customer[] {
  const term = search.trim().toLowerCase();
  const digits = term.replaceAll(/\D/g, "");
  return customers.filter((customer) => {
    if (status !== "all" && customer.status !== status) {
      return false;
    }
    if (term === "") {
      return true;
    }
    const matchesName = customer.name.toLowerCase().includes(term);
    const matchesDocument = digits !== "" && customer.document.includes(digits);
    return matchesName || matchesDocument;
  });
}
