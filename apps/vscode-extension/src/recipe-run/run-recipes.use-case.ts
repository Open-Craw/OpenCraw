import { copyFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import * as vscode from 'vscode'
import type { RecipeNode } from '../recipe-explorer'
import { cliScript, runCli } from './run-cli.client'
import type { CliResult } from './run-cli.client'
import { progressMessage, recordCount } from './run-progress.algorithm'
import { planRun, runArguments } from './run-plan.algorithm'
import type { RunPlan } from './run-plan.algorithm'
import { defaultFileName, saveFilters, saveNameProblem } from './save-options.policy'

/** Runs recipes from the recipes view and saves the result where the person says. */
export interface RecipeRunner {
  /** Runs the input recipe, or every input of the output recipe, that was clicked; asks where to save when the crawl is over. */
  run: (node: RecipeNode) => Promise<void>
}

export interface RecipeRunnerOptions {
  extensionPath: string
  /** Where the crawl's own messages go, for a person who wants to read them. */
  output:        vscode.OutputChannel
  /** The hooks module the person set, read when a run starts so a changed setting counts at once. */
  hooksFile:     () => string | undefined
}

/**
 * Asks where to save, with the operating system's own dialog. The extension of the name is the format, so a name that is not one is explained and the
 * dialog opens again.
 *
 * @param plan - What was run, for the suggested name.
 * @returns The file to write, or `undefined` when the dialog was closed.
 */
async function askWhereToSave (plan: RunPlan): Promise<string | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(dirname(plan.output))
  let suggestion = vscode.Uri.joinPath(folder, defaultFileName(plan.outputId))
  for (;;) {
    const picked = await vscode.window.showSaveDialog({ title: `Save the ${plan.outputId} records as…`, saveLabel: 'Save', defaultUri: suggestion, filters: saveFilters() })
    if (picked === undefined) return undefined
    const problem = saveNameProblem(picked.fsPath)
    if (problem === undefined) return picked.fsPath
    await vscode.window.showWarningMessage(problem, { modal: true })
    suggestion = vscode.Uri.joinPath(folder, `${basename(picked.fsPath, extname(picked.fsPath))}.xlsx`)
  }
}

/** Shows the saved file: text formats in the editor, the others (a spreadsheet, a page, a PDF) in the program that opens them. */
async function showSaved (path: string): Promise<void> {
  const uri = vscode.Uri.file(path)
  if (['.xlsx', '.html', '.pdf'].includes(extname(path).toLowerCase())) await vscode.env.openExternal(uri)
  else await vscode.commands.executeCommand('vscode.open', uri)
}

/** How many records the crawl wrote; none when it wrote nothing at all (no file). */
async function collected (records: string): Promise<number> {
  try {
    return recordCount(await readFile(records, 'utf8'))
  } catch {
    return 0
  }
}

/**
 * The recipes view's Run: crawl in a process of its own with a notification that can cancel it, then, when it is over, ask where to save and in what
 * format (the file's extension), and write the records there. The crawl goes to a temporary JSON Lines file first, so the question comes after the
 * work, when the person knows what came out.
 *
 * @param options - The extension's folder, the output channel, the hooks setting.
 * @returns The runner.
 */
export function createRecipeRunner (options: RecipeRunnerOptions): RecipeRunner {
  const script = (): string => cliScript(options.extensionPath)

  async function crawl (plan: RunPlan, records: string): Promise<CliResult> {
    const args = runArguments(plan, records, options.hooksFile())
    options.output.appendLine(`> opencraw ${args.join(' ')}`)

    return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `OpenCraw: running ${plan.label}`, cancellable: true }, async (progress, token) => {
      const controller = new AbortController()
      token.onCancellationRequested(() => { controller.abort() })

      return await runCli(script(), args, {
        signal:   controller.signal,
        onOutput: (chunk) => {
          options.output.append(chunk)
          const message = progressMessage(chunk)
          if (message !== undefined) progress.report({ message })
        },
      })
    })
  }

  async function save (plan: RunPlan, records: string, target: string): Promise<void> {
    if (extname(target).toLowerCase() === '.jsonl') {
      await copyFile(records, target)

      return
    }
    const result = await runCli(script(), ['export', records, plan.output, '--out', target])
    if (result.code !== 0) throw new Error(result.stderr.trim().split('\n').pop() ?? 'the export failed')
  }

  async function finish (plan: RunPlan, records: string, result: CliResult): Promise<void> {
    if (result.cancelled) {
      await vscode.window.showInformationMessage(`OpenCraw: ${plan.label} was stopped.`)

      return
    }
    const count = await collected(records)
    if (count === 0) {
      const choice = await vscode.window.showErrorMessage(`OpenCraw: ${plan.label} produced no records${result.code === 0 ? '' : ' (it stopped with an error)'}.`, 'Show the details')
      if (choice !== undefined) options.output.show()

      return
    }
    const target = await askWhereToSave(plan)
    if (target === undefined) {
      await vscode.window.showInformationMessage(`OpenCraw: ${String(count)} records were collected but not saved.`)

      return
    }
    await save(plan, records, target)
    const partial = result.code === 0 ? '' : ' Some recipes stopped with an error: see the OpenCraw output.'
    const choice = await vscode.window.showInformationMessage(`OpenCraw: ${String(count)} records saved to ${basename(target)}.${partial}`, 'Open', 'Show in folder')
    if (choice === 'Open') await showSaved(target)
    else if (choice === 'Show in folder') await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target))
  }

  return {
    run: async (node) => {
      const planned = planRun(node)
      if (!planned.ok) {
        await vscode.window.showWarningMessage(`OpenCraw: ${planned.reason}`)

        return
      }
      const records = join(tmpdir(), `opencraw-run-${String(Date.now())}.jsonl`)
      try {
        await finish(planned.plan, records, await crawl(planned.plan, records))
      } catch (error) {
        await vscode.window.showErrorMessage(`OpenCraw: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        await rm(records, { force: true })
      }
    },
  }
}
