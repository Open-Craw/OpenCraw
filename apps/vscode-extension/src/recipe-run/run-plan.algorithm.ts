import type { RecipeNode } from '../recipe-explorer'

/** What to run, as the command line needs it. */
export interface RunPlan {
  /** The output recipe, then the input recipes: the paths `opencraw run` is given. */
  paths:    string[]
  /** The input recipe ids to run (`--only`); empty runs every input given. */
  only:     string[]
  outputId: string
  /** The output recipe's file: `opencraw export` needs it to name the columns. */
  output:   string
  /** What the run is called to the person. */
  label:    string
}

export type RunPlanResult = { ok: true, plan: RunPlan } | { ok: false, reason: string }

/**
 * Decides what a Run click runs: on an input recipe, that one input; on an output recipe, every input that feeds it. Both need the output recipe,
 * which is what the records are mapped onto.
 *
 * @param node - The row that was clicked.
 * @returns The plan, or why there is nothing to run.
 */
export function planRun (node: RecipeNode): RunPlanResult {
  const { group } = node
  if (group.outputFile === undefined) return { ok: false, reason: `There is no output recipe with the id "${group.outputId}" in this workspace, so there is nothing to map the records onto.` }
  if (node.type === 'input') {
    return { ok: true, plan: { paths: [group.outputFile, node.header.file], only: [node.header.id], outputId: group.outputId, output: group.outputFile, label: node.header.id } }
  }
  if (group.inputs.length === 0) return { ok: false, reason: `No input recipe feeds "${group.outputId}" yet.` }

  return { ok: true, plan: { paths: [group.outputFile, ...group.inputs.map(input => input.file)], only: [], outputId: group.outputId, output: group.outputFile, label: `${group.outputId} (${String(group.inputs.length)} input${group.inputs.length === 1 ? '' : 's'})` } }
}

/**
 * The command line that runs a plan, its records going to a JSON Lines file: that format streams, and it is what `export` reads afterwards.
 *
 * @param plan - What to run.
 * @param records - The JSON Lines file to write.
 * @param hooks - The person's hooks module, when they set one.
 * @returns The arguments after the program name.
 */
export function runArguments (plan: RunPlan, records: string, hooks?: string): string[] {
  return ['run', ...plan.paths, '--out', records, '--trace', ...plan.only.flatMap(id => ['--only', id]), ...(hooks === undefined ? [] : ['--hooks', hooks])]
}
