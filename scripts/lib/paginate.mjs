/**
 * Pages through a row source until it runs dry.
 *
 * Supabase caps a plain `select` at 1000 rows, so a single call against a
 * table with more rows returns a file that looks complete but isn't. Every
 * table read in the backup goes through here.
 *
 * @param {(from: number, to: number) => Promise<Array>} fetchPage
 *        Fetches one inclusive range. Should return [] past the end.
 * @param {number} pageSize    Rows per request.
 * @param {{maxPages?: number}} [opts]
 *        Safety valve: a source that never returns a short page would
 *        otherwise loop until the process dies.
 * @returns {Promise<Array>} Every row, in source order.
 */
export async function fetchAllRows(fetchPage, pageSize = 1000, opts = {}) {
  const maxPages = opts.maxPages ?? 10000;
  const all = [];
  let from = 0;

  for (let page = 0; ; page++) {
    if (page >= maxPages) {
      throw new Error(
        `fetchAllRows: hit maxPages (${maxPages}) after ${all.length} rows — ` +
          `the source never returned a short page`
      );
    }

    const rows = await fetchPage(from, from + pageSize - 1);
    if (!rows || rows.length === 0) return all;

    all.push(...rows);

    // A short page means we reached the end; a full one means keep going.
    if (rows.length < pageSize) return all;
    from += pageSize;
  }
}
