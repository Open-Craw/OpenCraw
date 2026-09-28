/**
 * Whether a cell holds a figure (an amount, a count, a date written in
 * digits) rather than words: it starts with a number, or its digits are at
 * least as many as its letters. `2,820`, `$560`, `2659 $560`, `(£0.58m)`,
 * `-3 days` and `2026` are figures; `FY26 Lodging Rate`,
 * `FM Classes A, B1 & C3` and `(APRIL 1, 2020)` are words that happen to
 * contain digits.
 *
 * @param cell - The cell's text.
 * @returns Whether it is a figure.
 */
export function isFigure (cell: string): boolean {
  if (/^[\s(+\-–−<>=~$€£¥]*\d/u.test(cell)) return true
  const digits = cell.match(/\d/g)?.length ?? 0

  return digits > 0 && digits >= (cell.match(/\p{L}/gu)?.length ?? 0)
}

/**
 * A row that reads like a table's header: at least two cells, none a figure.
 *
 * @param cells - The row's non-empty cells.
 * @returns Whether it could be a header.
 */
export function isHeaderRow (cells: readonly string[]): boolean {
  return cells.length >= 2 && cells.every(cell => !isFigure(cell))
}

/**
 * A row that reads like a table's data: at least two cells, one a figure.
 *
 * @param cells - The row's non-empty cells.
 * @returns Whether it looks like data.
 */
export function isDataRow (cells: readonly string[]): boolean {
  return cells.length >= 2 && cells.some(cell => isFigure(cell))
}
