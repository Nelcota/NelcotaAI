import { describe, expect, test } from "bun:test";

import { applyAmountKey, maskAmountInput } from "./amount-mask";

describe("maskAmountInput", () => {
  test("fills digits in from the cents", () => {
    const typed = "15000";

    const masked = maskAmountInput(typed);

    expect(masked).toBe("150,00");
  });

  test("shows a single digit as cents", () => {
    const typed = "5";

    const masked = maskAmountInput(typed);

    expect(masked).toBe("0,05");
  });

  test("adds thousands separators", () => {
    const typed = "123456";

    const masked = maskAmountInput(typed);

    expect(masked).toBe("1.234,56");
  });

  test("re-reads an already masked amount after one more digit", () => {
    const typed = "150,001";

    const masked = maskAmountInput(typed);

    expect(masked).toBe("1.500,01");
  });

  test("drops leading zeros, letters and symbols", () => {
    const pasted = "R$ 000.050,00";

    const masked = maskAmountInput(pasted);

    expect(masked).toBe("50,00");
  });

  test("ignores digits past the limit", () => {
    const typed = "12345678901";

    const masked = maskAmountInput(typed);

    expect(masked).toBe("1.234.567,89");
  });

  test("returns an empty string when only zeros were typed", () => {
    const typed = "000";

    const masked = maskAmountInput(typed);

    expect(masked).toBe("");
  });
});

describe("applyAmountKey", () => {
  test("enters a digit from the right", () => {
    const current = "1,50";

    const next = applyAmountKey(current, "0", false);

    expect(next).toBe("15,00");
  });

  test("removes the last digit on Backspace", () => {
    const current = "15,00";

    const next = applyAmountKey(current, "Backspace", false);

    expect(next).toBe("1,50");
  });

  test("clears the amount on Backspace when everything is selected", () => {
    const current = "15,00";

    const next = applyAmountKey(current, "Backspace", true);

    expect(next).toBe("");
  });

  test("starts over with the typed digit when everything is selected", () => {
    const current = "15,00";

    const next = applyAmountKey(current, "7", true);

    expect(next).toBe("0,07");
  });

  test("leaves other keys to the browser", () => {
    const current = "15,00";

    const next = applyAmountKey(current, "Tab", false);

    expect(next).toBeNull();
  });

  test("empties the amount when the last digit is removed", () => {
    const current = "0,05";

    const next = applyAmountKey(current, "Backspace", false);

    expect(next).toBe("");
  });
});
