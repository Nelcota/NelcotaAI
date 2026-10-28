import { describe, expect, test } from "bun:test";

import { readSignUpDetails } from "./sign-up-details";

describe("readSignUpDetails", () => {
  test("reads the details saved at sign-up", () => {
    const metadata = { name: "Ana", organization_name: "Padaria", document: "11222333000181" };

    const details = readSignUpDetails(metadata);

    expect(details).toEqual({
      name: "Ana",
      organizationName: "Padaria",
      document: "11222333000181",
    });
  });

  test("uses empty strings when the metadata is empty", () => {
    const metadata = {};

    const details = readSignUpDetails(metadata);

    expect(details).toEqual({ name: "", organizationName: "", document: "" });
  });

  test("ignores values that are not strings", () => {
    const metadata = { name: 42, organization_name: null, document: ["1"] };

    const details = readSignUpDetails(metadata);

    expect(details).toEqual({ name: "", organizationName: "", document: "" });
  });
});
