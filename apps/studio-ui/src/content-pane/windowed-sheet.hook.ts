import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GridCellView, GridSheetView } from '@opencraw/studio'
import { useStudioClient } from '../studio-client'
import { sparseRows, wantedWindows } from './windowed-rows.algorithm'

type Rows = readonly (readonly GridCellView[])[]
type Windows = ReadonlyMap<number, Rows>

export interface WindowedSheet {
  /** The sheet with every row the grid can draw: for a big file, only the windows held now are filled in (the others are holes). */
  sheet:    GridSheetView
  /** Tells the hook which rows are on screen so it fetches the windows around them and lets go of the rest. */
  showRows: (first: number, last: number) => void
}

/** The windows a sheet starts with: its first one, which `grid-view` carries. */
function firstWindow (source: GridSheetView): Windows {
  return source.rowCount === undefined ? new Map() : new Map<number, Rows>([[0, source.rows]])
}

/**
 * A big CSV or spreadsheet is never sent to the browser whole: `grid-view` carries the first window of each sheet and its total row count,
 * and this hook fetches the windows around the rows on screen (`grid-rows`) and drops the ones left behind, so only a few screens of rows
 * are in memory however long the file is. A sheet with no `rowCount` already holds all its rows and passes through untouched.
 *
 * @param recipeId - The recipe being read.
 * @param stepPath - The step the snapshot was cached for.
 * @param sheetIndex - Which sheet of the view is shown.
 * @param source - The sheet as `grid-view` sent it.
 * @returns The sheet to draw and the callback to report the visible rows to.
 */
export function useWindowedSheet (recipeId: string, stepPath: string, sheetIndex: number, source: GridSheetView): WindowedSheet {
  const client = useStudioClient()
  const total = source.rowCount
  const windowSize = source.rows.length
  const [held, setHeld] = useState<{ source: GridSheetView, windows: Windows }>(() => ({ source, windows: firstWindow(source) }))
  const loading = useRef(new Set<number>())
  const generation = useRef(0)
  const heldRef = useRef<Windows>(new Map())

  // A different sheet, file or reading is a fresh start: its first window comes with the view, the rest are fetched.
  let current = held
  if (held.source !== source) {
    current = { source, windows: firstWindow(source) }
    setHeld(current)
  }
  heldRef.current = current.windows
  useEffect(() => {
    generation.current += 1
    loading.current.clear()
  }, [source])

  const showRows = useCallback((first: number, last: number): void => {
    if (total === undefined || windowSize === 0) return
    const wanted = wantedWindows(first, last, windowSize, total)
    const turn = generation.current
    setHeld((previous) => {
      if (previous.source !== source) return previous
      const kept = new Map([...previous.windows].filter(([window]) => wanted.includes(window)))

      return kept.size === previous.windows.size ? previous : { source, windows: kept }
    })
    for (const window of wanted) {
      if (loading.current.has(window) || heldRef.current.has(window)) continue
      loading.current.add(window)
      void client.gridRows(recipeId, stepPath, sheetIndex, window * windowSize, windowSize).then(({ rows }) => {
        loading.current.delete(window)
        if (turn !== generation.current) return
        setHeld((previous) => (previous.source !== source || previous.windows.has(window) ? previous : { source, windows: new Map(previous.windows).set(window, rows) }))
      }).catch(() => { loading.current.delete(window) })
    }
  }, [client, recipeId, stepPath, sheetIndex, source, total, windowSize])

  const sheet = useMemo(() => {
    if (total === undefined) return source

    return { ...source, rows: sparseRows<GridCellView[]>(total, windowSize, current.windows as ReadonlyMap<number, readonly GridCellView[][]>) }
  }, [source, total, windowSize, current.windows])

  return { sheet, showRows }
}
