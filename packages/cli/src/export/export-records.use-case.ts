import { readFile } from 'node:fs/promises'
import { RecipeValidationError, fileSink, outputRecordOf, parseOutputRecipe, readRecordsFile } from '@opencraw/core'
import type { Command } from '../arguments'
import type { Terminal } from '../terminal'

/**
 * Writes a finished run's JSON Lines file again in another format: the extension of `--out` chooses it, as it does for `run`. The output recipe
 * supplies the columns (its fields, in order, with their types and descriptions).
 *
 * @param command - The parsed `export` command.
 * @param terminal - Where the result and errors go.
 * @returns The exit code: 0, or 1 when a file cannot be read, the recipe is not an output recipe, or the extension names no format.
 */
export async function exportRecords (command: Extract<Command, { name: 'export' }>, terminal: Terminal): Promise<number> {
  try {
    const sink = fileSink(command.out, { browser: { executablePath: command.options.browserPath } })
    const output = parseOutputRecipe(JSON.parse(await readFile(command.output, 'utf8')) as unknown, command.output)
    const stored = await readRecordsFile(command.records)
    await sink.open(output)
    for (const line of stored) await sink.write(outputRecordOf(line))
    const summary = await sink.close()
    terminal.err(`${String(summary.written)} records written to ${summary.location ?? command.out}`)

    return 0
  } catch (error) {
    if (error instanceof RecipeValidationError) for (const issue of error.issues) terminal.err(`${error.source}: ${issue.path === '' ? '(root)' : issue.path}: ${issue.message}`)
    else terminal.err(error instanceof Error ? error.message : String(error))

    return 1
  }
}
