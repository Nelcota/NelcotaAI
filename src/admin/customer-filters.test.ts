import { describe, expect, test } from "bun:test";

import { filterCustomers } from "./customer-filters";

const customers = [
  { name: "Padaria Nova", document: "11222333000181", status: "active" },
  { name: "Oficina do Zé", document: "52998224725", status: "blocked" },
  { name: "Mercado Central", document: "04252011000110", status: "active" },
] as const;

describe("filterCustomers", () => {
  test("keeps every customer when the search is blank and the status is all", () => {
    const result = filterCustomers(customers, "   ", "all");

    expect(result).toHaveLength(3);
  });

  test("matches part of the name ignoring case", () => {
    const result = filterCustomers(customers, "padARIA", "all");

    expect(result.map((customer) => customer.name)).toEqual(["Padaria Nova"]);
  });

  test("matches digits of a punctuated document", () => {
    const result = filterCustomers(customers, "529.982", "all");

    expect(result.map((customer) => customer.name)).toEqual(["Oficina do Zé"]);
  });

  test("keeps only blocked customers", () => {
    const result = filterCustomers(customers, "", "blocked");

    expect(result.map((customer) => customer.name)).toEqual(["Oficina do Zé"]);
  });

  test("combines the search with the status", () => {
    const result = filterCustomers(customers, "a", "active");

    expect(result.map((customer) => customer.name)).toEqual(["Padaria Nova", "Mercado Central"]);
  });

  test("returns nothing when no customer matches", () => {
    const result = filterCustomers(customers, "inexistente", "all");

    expect(result).toEqual([]);
  });

  test("returns nothing for an empty list", () => {
    const result = filterCustomers([], "a", "all");

    expect(result).toEqual([]);
  });
});
