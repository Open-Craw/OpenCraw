/**
 * How many windows of rows the grid keeps in memory around the one scrolled to: the one on screen, the one before and the one after (a few
 * screens of a big file), so scrolling either way finds rows ready. Every other window is dropped and fetched again if the person scrolls back.
 */
export const WINDOWS_KEPT_AROUND = 1

/**
 * The windows to hold when rows `first` to `last` are on screen.
 *
 * @param first - The first visible row.
 * @param last - The last visible row.
 * @param windowSize - Rows per window.
 * @param totalRows - Rows in the sheet.
 * @returns The wanted window numbers, ascending: those the visible rows fall in, and one more each side.
 */
export function wantedWindows (first: number, last: number, windowSize: number, totalRows: number): number[] {
  const lastWindow = Math.max(0, Math.ceil(totalRows / windowSize) - 1)
  const from = Math.max(0, Math.floor(first / windowSize) - WINDOWS_KEPT_AROUND)
  const to = Math.min(lastWindow, Math.floor(last / windowSize) + WINDOWS_KEPT_AROUND)
  const wanted: number[] = []
  for (let window = from; window <= to; window += 1) wanted.push(window)

  return wanted
}

/**
 * A sheet's rows with only the loaded windows filled in: the array is as long as the whole sheet (so scrolling, row numbers and row
 * positions work for every row) and the rows of a window that is not loaded are holes the grid draws as blank until they arrive.
 *
 * @param totalRows - Rows in the sheet.
 * @param windowSize - Rows per window.
 * @param windows - The loaded windows, by number.
 * @returns A sparse array of rows.
 */
export function sparseRows<Row> (totalRows: number, windowSize: number, windows: ReadonlyMap<number, readonly Row[]>): Row[] {
  // Holes, not `undefined` values: `map` and `forEach` skip a hole, so the code that walks a sheet's rows only ever sees the loaded ones.
  const rows: Row[] = []
  rows.length = totalRows
  for (const [window, loaded] of windows) {
    for (const [offset, row] of loaded.entries()) {
      const index = window * windowSize + offset
      if (index < totalRows) rows[index] = row
    }
  }

  return rows
}
