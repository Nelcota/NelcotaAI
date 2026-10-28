import { describe, expect, test } from "bun:test";

import { collectPages, nextPageCursor } from "./pagination";

describe("complete cursor pagination", () => {
  test("collects records beyond the 1000-row API limit without dropping tied timestamps", async () => {
    const rows = Array.from({ length: 1005 }, (_, index) => ({
      id: String(1005 - index).padStart(5, "0"),
      created_at: "2026-10-01T12:00:00.123456Z",
    }));
    const visited: unknown[] = [];

    const all = await collectPages(
      (cursor: { readonly id: string; readonly created_at: string } | null) => {
        visited.push(cursor);
        return Promise.resolve(
          rows
            .filter(
              (row) =>
                cursor == null ||
                row.created_at < cursor.created_at ||
                (row.created_at === cursor.created_at && row.id < cursor.id),
            )
            .slice(0, 1000),
        );
      },
      (row) => ({ id: row.id, created_at: row.created_at }),
      1000,
    );

    expect(all).toEqual(rows);
    expect(new Set(all.map((row) => row.id)).size).toBe(1005);
    expect(visited).toEqual([null, rows[999]]);
  });

  test("propagates a failure on a later page instead of exporting a partial result", async () => {
    const read = (cursor: number | null) =>
      cursor == null ? Promise.resolve([1, 2]) : Promise.reject(new Error("second page failed"));

    const error: unknown = await collectPages(read, (row) => row, 2).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty("message", "second page failed");
  });

  test("stops after the empty page following an exact page boundary", async () => {
    const all = await collectPages(
      (cursor: number | null) => Promise.resolve(cursor == null ? [1, 2] : []),
      (row) => row,
      2,
    );

    expect(all).toEqual([1, 2]);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects an invalid page size: %s",
    async (pageSize) => {
      const error: unknown = await collectPages(
        () => Promise.resolve([]),
        (row: number) => row,
        pageSize,
      ).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(RangeError);
    },
  );

  test("retains timestamp precision in the next page cursor", () => {
    const row = { id: "test-id", created_at: "2026-10-01T12:00:00.123456Z" };

    expect(nextPageCursor([row], 1, (item) => item)).toEqual(row);
    expect(nextPageCursor([], 1, (item: typeof row) => item)).toBeNull();
  });
});

test("rejects a repeated cursor instead of looping forever when a service ignores pagination", async () => {
  const error: unknown = await collectPages(
    () => Promise.resolve([1, 2]),
    (row) => row,
    2,
  ).catch((cause: unknown) => cause);

  expect(error).toBeInstanceOf(Error);
  expect(error).toHaveProperty("message", "pagination cursor did not advance");
});
