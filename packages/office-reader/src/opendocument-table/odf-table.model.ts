/** How many times a repeated cell or row is written out: the format repeats empty ones to its limits. */
const MAX_REPEAT = 1024

/** A column index as its letters: 0 → `A`, 26 → `AA`. */
function letters (index: number): string {
  let rest = index + 1
  let name = ''
  while (rest > 0) {
    name = String.fromCodePoint(65 + ((rest - 1) % 26)) + name
    rest = Math.floor((rest - 1) / 26)
  }

  return name
}

/** A repeat or span count: at least 1, whatever the file says. */
function count (value: string | undefined): number {
  const number = Math.trunc(Number(value ?? ''))

  return Number.isNaN(number) || number < 1 ? 1 : number
}

interface OpenCell {
  paragraphs: string[]
  columns:    number
  rows:       number
  repeat:     number
}

/**
 * A table of an OpenDocument text or presentation being read, one event at a time: its rows as a grid of cell texts, with the merged cells as A1
 * ranges (the spanning cell holds the text; the cells it covers are in the grid as empty text, the way the file stores them). The caller feeds it the
 * `table:table-row` and `table:table-cell` (or `covered-table-cell`) elements and the paragraphs of the cell that is open.
 */
export class OdfTable {
  private row:     string[] | undefined
  private rowRepeat = 1
  private cell:    OpenCell | undefined
  readonly rows:   string[][] = []
  readonly merges: string[] = []

  /** Whether a cell is open: paragraphs read now belong to it. */
  get inCell (): boolean {
    return this.cell !== undefined
  }

  /** A row starts. */
  openRow (attributes: Readonly<Record<string, string>>): void {
    this.row = []
    this.rowRepeat = count(attributes['table:number-rows-repeated'])
  }

  /** A cell starts, `table-cell` or `covered-table-cell`. */
  openCell (attributes: Readonly<Record<string, string>>): void {
    this.cell = {
      paragraphs: [],
      columns:    count(attributes['table:number-columns-spanned']),
      rows:       count(attributes['table:number-rows-spanned']),
      repeat:     Math.min(count(attributes['table:number-columns-repeated']), MAX_REPEAT),
    }
  }

  /** A paragraph of the open cell has been read. */
  addParagraph (text: string): void {
    this.cell?.paragraphs.push(text)
  }

  /** The open cell ends: its text goes in the row, once for each time it repeats, and a merge is recorded when it spans. */
  closeCell (): void {
    const { cell } = this
    if (cell === undefined) return
    const row = this.row ?? []
    const text = cell.paragraphs.join('\n').trim()
    if (cell.columns > 1 || cell.rows > 1) this.merges.push(`${letters(row.length)}${String(this.rows.length + 1)}:${letters(row.length + cell.columns - 1)}${String(this.rows.length + cell.rows)}`)
    for (let copy = 0; copy < cell.repeat; copy += 1) row.push(text)
    this.row = row
    this.cell = undefined
  }

  /** The open row ends: it joins the grid, once for each time it repeats. */
  closeRow (): void {
    if (this.row === undefined) return
    for (let copy = 0; copy < Math.min(this.rowRepeat, MAX_REPEAT); copy += 1) this.rows.push([...this.row])
    this.row = undefined
    this.rowRepeat = 1
  }

  /** The table's text as its cell texts separated by spaces and its rows by line breaks, for a table nested in a cell. */
  get text (): string {
    return this.rows.map(row => row.filter(cell => cell !== '').join(' ')).join('\n')
  }
}
