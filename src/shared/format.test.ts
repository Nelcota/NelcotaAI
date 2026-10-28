import { describe, expect, test } from "bun:test";

import {
  formatCents,
  formatCentsParts,
  formatCompactCents,
  formatLongDate,
  formatMonthYear,
  formatRequestCount,
  formatDate,
  formatDateTime,
  formatDocument,
  formatInteger,
  formatShortMonth,
} from "./format";

// Intl separates the currency symbol with a non-breaking space.
const NBSP = " ";

describe("formatCents", () => {
  test("formats cents as reais with thousand separators", () => {
    const result = formatCents(123456);

    expect(result).toBe(`R$${NBSP}1.234,56`);
  });

  test("formats zero", () => {
    const result = formatCents(0);

    expect(result).toBe(`R$${NBSP}0,00`);
  });

  test("formats negative amounts", () => {
    const result = formatCents(-50);

    expect(result).toBe(`-R$${NBSP}0,50`);
  });

  test("throws RangeError for a fractional amount", () => {
    const act = () => formatCents(10.5);

    expect(act).toThrow(RangeError);
  });

  test("throws RangeError for NaN", () => {
    const act = () => formatCents(Number.NaN);

    expect(act).toThrow(RangeError);
  });

  test("throws RangeError for Infinity", () => {
    const act = () => formatCents(Number.POSITIVE_INFINITY);

    expect(act).toThrow(RangeError);
  });
});

describe("formatInteger", () => {
  test("uses a dot as thousand separator", () => {
    const result = formatInteger(1234567);

    expect(result).toBe("1.234.567");
  });

  test("throws RangeError for NaN", () => {
    const act = () => formatInteger(Number.NaN);

    expect(act).toThrow(RangeError);
  });
});

describe("formatDate", () => {
  test("converts a UTC timestamp to the Sao Paulo date", () => {
    const result = formatDate("2026-10-28T02:00:00Z");

    expect(result).toBe("27/10/2026");
  });

  test("throws RangeError for an unparseable timestamp", () => {
    const act = () => formatDate("27/10/2026");

    expect(act).toThrow(RangeError);
  });
});

describe("formatDateTime", () => {
  test("converts a UTC timestamp to Sao Paulo date and time", () => {
    const result = formatDateTime("2026-10-24T14:30:00Z");

    expect(result).toBe("24/10/2026, 11:30");
  });

  test("throws RangeError for an empty timestamp", () => {
    const act = () => formatDateTime("");

    expect(act).toThrow(RangeError);
  });
});

describe("formatShortMonth", () => {
  test("formats the month with a two-digit year", () => {
    const result = formatShortMonth("2026-10-01");

    expect(result).toBe("out/26");
  });

  test("formats January", () => {
    const result = formatShortMonth("2027-01-15");

    expect(result).toBe("jan/27");
  });

  test("throws RangeError for month 13", () => {
    const act = () => formatShortMonth("2026-13-01");

    expect(act).toThrow(RangeError);
  });
});

describe("formatDocument", () => {
  test("formats a CPF", () => {
    const result = formatDocument("12345678901");

    expect(result).toBe("123.456.789-01");
  });

  test("formats a CNPJ", () => {
    const result = formatDocument("12345678000190");

    expect(result).toBe("12.345.678/0001-90");
  });

  test("returns other inputs unchanged", () => {
    const result = formatDocument("123");

    expect(result).toBe("123");
  });
});

describe("formatCompactCents", () => {
  test("abbreviates thousands", () => {
    const result = formatCompactCents(150000);

    expect(result).toBe(`R$${NBSP}1,5${NBSP}mil`);
  });

  test("keeps small amounts whole", () => {
    const result = formatCompactCents(50000);

    expect(result).toBe(`R$${NBSP}500`);
  });

  test("throws RangeError for NaN", () => {
    const act = () => formatCompactCents(Number.NaN);

    expect(act).toThrow(RangeError);
  });
});

describe("formatLongDate", () => {
  test("shows the weekday in Sao Paulo", () => {
    const result = formatLongDate(new Date("2026-10-28T02:00:00Z"));

    expect(result).toBe("terça-feira, 27 de outubro de 2026");
  });

  test("throws RangeError for an invalid date", () => {
    const act = () => formatLongDate(new Date("x"));

    expect(act).toThrow(RangeError);
  });
});

describe("formatCentsParts", () => {
  test("separates the symbol from the number", () => {
    const parts = formatCentsParts(4206900);

    expect(parts).toEqual({ symbol: "R$", amount: "42.069,00" });
  });

  test("keeps the minus sign with the symbol", () => {
    const parts = formatCentsParts(-121200);

    expect(parts).toEqual({ symbol: "-R$", amount: "1.212,00" });
  });

  test("throws RangeError for a fractional amount", () => {
    const act = () => formatCentsParts(1.5);

    expect(act).toThrow(RangeError);
  });
});

describe("formatMonthYear", () => {
  test("names the month in Portuguese", () => {
    const result = formatMonthYear("2026-10-01");

    expect(result).toBe("outubro de 2026");
  });

  test("keeps the first day in its own month", () => {
    const result = formatMonthYear("2026-03-01");

    expect(result).toBe("março de 2026");
  });

  test("throws RangeError for a malformed date", () => {
    const act = () => formatMonthYear("10/2026");

    expect(act).toThrow(RangeError);
  });
});

describe("formatRequestCount", () => {
  test("uses the singular for one request", () => {
    const result = formatRequestCount(1);

    expect(result).toBe("1 pedido");
  });

  test("uses the plural for zero requests", () => {
    const result = formatRequestCount(0);

    expect(result).toBe("0 pedidos");
  });

  test("formats thousands with a dot", () => {
    const result = formatRequestCount(1234);

    expect(result).toBe("1.234 pedidos");
  });
});
