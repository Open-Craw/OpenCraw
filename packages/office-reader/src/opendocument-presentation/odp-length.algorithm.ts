/** Points in one of each unit an OpenDocument length is written in. */
const POINTS_PER: Readonly<Record<string, number>> = {
  pt: 1,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  in: 72,
  pc: 12,
  px: 0.75,
}

/**
 * An OpenDocument length (`28cm`, `10.5in`, `4pt`; a bare number is points) in points, rounded to two decimals as the `.pptx` reader gives positions.
 *
 * @param value - The attribute's text.
 * @returns The length in points, or `undefined` when there is none or it is not a length.
 */
export function pointsOf (value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z]*)$/i.exec(value.trim())
  if (match === null) return undefined
  const unit = match[2].toLowerCase() === '' ? 'pt' : match[2].toLowerCase()
  const perUnit = POINTS_PER[unit]
  if (perUnit === undefined) return undefined

  return Math.round(Number(match[1]) * perUnit * 100) / 100
}
