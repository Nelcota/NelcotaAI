/** The unrounded timestamp and unique ID of the last item in a descending page. */
export interface CreatedAtCursor {
  readonly created_at: string;
  readonly id: string;
}

/** Returns the next cursor only when a full page may have more results. */
export function nextPageCursor<Row, Cursor>(
  rows: readonly Row[],
  pageSize: number,
  cursorOf: (row: Row) => Cursor,
): Cursor | null {
  const last = rows.at(-1);
  return rows.length < pageSize || last == null ? null : cursorOf(last);
}

/**
 * Collects a complete cursor-paginated export or lookup, propagating failures from every page.
 *
 * @param fetchPage - Fetches one ordered page after the supplied cursor.
 * @param cursorOf - Extracts the stable cursor from the final row.
 * @param pageSize - Positive maximum rows per request.
 * @returns Every matching row, in server order.
 * @throws {RangeError} When pageSize is not a positive safe integer.
 * @throws {Error} When the service returns a full page without advancing its cursor.
 */
export async function collectPages<Row, Cursor>(
  fetchPage: (cursor: Cursor | null) => Promise<Row[]>,
  cursorOf: (row: Row) => Cursor,
  pageSize: number,
): Promise<Row[]> {
  if (Number.isSafeInteger(pageSize) === false || pageSize <= 0)
    throw new RangeError("page size must be a positive safe integer");
  const pages: Row[][] = [];
  async function read(cursor: Cursor | null): Promise<void> {
    const page = await fetchPage(cursor);
    pages.push(page);
    const next = nextPageCursor(page, pageSize, cursorOf);
    if (next == null) return;
    if (cursor != null && JSON.stringify(next) === JSON.stringify(cursor))
      throw new Error("pagination cursor did not advance");
    await read(next);
  }
  await read(null);
  return pages.flat();
}
