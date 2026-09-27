/** Handlers fed with the events inside one element, and what they read. */
export interface TextReader {
  open:  (name: string) => void
  text:  (text: string) => void
  close: (name: string) => void
  /** The text read: paragraphs joined by line breaks, trimmed. */
  value: () => string
}

/** Handlers that report whether they took the event: the chart's title takes every event inside it. */
export interface TitleReader {
  open:  (name: string) => boolean
  text:  (text: string) => boolean
  close: (name: string) => boolean
  /** The title, or `undefined` when it has no text of its own (an automatic title). */
  value: () => string | undefined
}

/**
 * Reads the text of a chart text element (`c:tx`, `cx:tx`, `txPr`): the runs
 * of its rich text (`a:t`, each `a:p` a line), or the cached or literal value
 * of a text linked to a cell (`c:strCache`'s `c:v`, `cx:txData`'s `cx:v`).
 * The cell reference itself (`c:f`, `cx:f`) is never read.
 *
 * @returns The handlers.
 */
export function chartText (): TextReader {
  const lines: string[] = []
  let capturing = false

  return {
    open: (name) => {
      switch (name) {
        // A paragraph, or a line break inside one, starts a line.
        case 'p':
        case 'br': {
          lines.push('')

          break
        }
        case 't':
        case 'v': {
          capturing = true

          break
        }
        // No default
      }
    },
    text: (text) => {
      if (!capturing) return
      if (lines.length === 0) lines.push('')
      lines[lines.length - 1] += text
    },
    close: (name) => {
      if (name === 't' || name === 'v') capturing = false
    },
    value: () => lines.join('\n').trim(),
  }
}

/**
 * Reads a chart's title (`c:title`, `cx:title`), the first `title` element it
 * is fed: its text (`tx`), once, else the runs of its text properties
 * (`txPr`), which some writers fill instead. Axis titles are the caller's to
 * leave out: they sit in the plot area.
 *
 * @returns The handlers.
 */
export function chartTitle (): TitleReader {
  const own = chartText()
  const properties = chartText()
  let depth = 0
  let done = false
  let part: TextReader | undefined

  return {
    open: (name) => {
      if (depth === 0) {
        if (done || name !== 'title') return false
        depth = 1

        return true
      }
      depth += 1
      if (depth === 2 && name === 'tx') part = own
      else if (depth === 2 && name === 'txPr') part = properties
      else part?.open(name)

      return true
    },
    text: (text) => {
      if (depth === 0) return false
      part?.text(text)

      return true
    },
    close: (name) => {
      if (depth === 0) return false
      if (depth === 1) done = true
      else if (depth === 2) part = undefined
      else part?.close(name)
      depth -= 1

      return true
    },
    value: () => {
      const text = own.value() === '' ? properties.value() : own.value()

      return text === '' ? undefined : text
    },
  }
}
