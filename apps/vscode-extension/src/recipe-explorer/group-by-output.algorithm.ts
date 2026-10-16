import type { RecipeGroup, RecipeHeader } from './recipe-header.contract'

/**
 * Groups recipes the way a person thinks of them: an output recipe, and under it the input recipes that fill it. Groups are ordered by output id and
 * so are the inputs of each. An output with no input still shows (nothing feeds it yet); an input that names an output the workspace does not hold
 * is grouped under that name with no output file, so it is not lost; an input that names no output at all is left out (it cannot run: there is
 * nothing to map its records onto).
 *
 * @param headers - Every recipe found.
 * @returns The groups.
 */
export function groupByOutput (headers: readonly RecipeHeader[]): RecipeGroup[] {
  const groups = new Map<string, RecipeGroup>()
  for (const header of headers) {
    if (header.kind === 'output') groups.set(header.id, { outputId: header.id, outputFile: header.file, inputs: groups.get(header.id)?.inputs ?? [] })
  }
  for (const header of headers) {
    if (header.kind !== 'input' || header.output === undefined) continue
    const group = groups.get(header.output) ?? { outputId: header.output, inputs: [] }
    group.inputs.push(header)
    groups.set(header.output, group)
  }

  const ordered = Array.from(groups.values(), group => ({ ...group, inputs: [...group.inputs].sort((a, b) => a.id.localeCompare(b.id)) }))

  return ordered.sort((a, b) => a.outputId.localeCompare(b.outputId))
}
