import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { sendStudioCommand } from './studio-command.client'
import { runningStudios } from './studio-instance.repository'
import type { StudioInstance } from './studio-instance.repository'

/** Input schema for `studio_status`: nothing. */
export const studioStatusInputShape = {}

/** Input schema for `studio_open_recipe`. */
export const studioOpenRecipeInputShape = {
  path:      z.string().min(1).describe('A recipe file (`*.input.json` / `*.ocw-in.json`), a folder of recipes, or a document, as an absolute path.'),
  workspace: z.string().optional().describe('The folder a document belongs to, when `path` is a document.'),
}

/** Input schema for `studio_pick`. */
export const studioPickInputShape = {
  recipeId: z.string().min(1).describe('The id of an input recipe whose start point is a web page, in the folder Studio has open.'),
  selector: z.string().optional().describe('A CSS selector of the element to pick on the page of the recipe. Give this or `text`.'),
  text:     z.string().optional().describe('The text the element shows, when you do not know a selector: the smallest element showing it is picked.'),
  add:      z.boolean().optional().describe('Add the pick to the recipe straight away (default: leave it staged, for the person to choose a selector and press Add to recipe).'),
}

/** Input schema for `studio_run_sample`. */
export const studioRunSampleInputShape = {
  recipeId:    z.string().min(1).describe('The id of an input recipe in the folder Studio has open.'),
  maxRecords:  z.number().int().positive().optional().describe('Stop after this many records. Default 10.'),
  waitSeconds: z.number().int().positive().max(300).optional().describe('How long to wait for the run to finish before answering that it is still running. Default 60.'),
}

const NO_STUDIO = 'No Studio is running. Start one with `opencraw studio <folder>`, or open a recipe from the OpenCraw view in VS Code ("Open in Studio"), then ask again.'
const POLL_MS = 500
/** How long a page gets to say how a request went. */
const REPORT_WAIT_MS = 30_000

function text (value: unknown, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], ...(isError && { isError }), ...(typeof value === 'object' && value !== null && { structuredContent: value as Record<string, unknown> }) }
}

function messageOf (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function studioOf (directory?: string): Promise<StudioInstance | undefined> {
  const [newest] = await runningStudios(directory)

  return newest
}

/**
 * `studio_status`: whether a Studio is running, which folder it has open, how many pages are watching and what it is running.
 *
 * @param directory - Where Studios announce themselves; the default is the user's own.
 * @returns The MCP tool result.
 */
export async function studioStatusTool (directory?: string): Promise<CallToolResult> {
  const studio = await studioOf(directory)
  if (studio === undefined) return text({ running: false, hint: NO_STUDIO })
  try {
    const status = await sendStudioCommand<object>(studio, { type: 'studio-status' })

    return text({ running: true, url: studio.url, ...status })
  } catch (error) {
    return text(`Studio did not answer: ${messageOf(error)}`, true)
  }
}

interface PageAnswer {
  pages:    number
  /** What the page reported; `undefined` when none did in time. */
  outcome?: { ok: boolean, message: string, detail?: Record<string, unknown> }
}

function sleep (ms: number): Promise<void> {
  return new Promise<void>((resolve) => { setTimeout(resolve, ms) })
}

/** Asks the open page to do something and waits for what it reports. */
async function askPage (studio: StudioInstance, request: Record<string, unknown>, waitMs = REPORT_WAIT_MS): Promise<PageAnswer> {
  const { pages, requestId } = await sendStudioCommand<{ pages: number, requestId: string }>(studio, { type: 'ask-ui', request })
  if (pages === 0) return { pages }
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    const outcome = await sendStudioCommand<{ state: string, ok?: boolean, message?: string, detail?: Record<string, unknown> }>(studio, { type: 'ui-outcome', requestId })
    if (outcome.state === 'done') return { pages, outcome: { ok: outcome.ok === true, message: outcome.message ?? '', detail: outcome.detail } }
    await sleep(POLL_MS / 5)
  }

  return { pages }
}

const NO_PAGE = 'Studio is running but no page is open on it. Ask the person to open Studio in their browser.'
const NO_REPORT = 'The page did not answer in time. Is the recipe in the folder Studio has open?'

/**
 * `studio_open_recipe`: opens a recipe, a folder or a document in the Studio the person is looking at, so they watch the work happen.
 *
 * @param args - What to open.
 * @param directory - Where Studios announce themselves.
 * @returns The MCP tool result.
 */
export async function studioOpenRecipeTool (args: { path: string, workspace?: string }, directory?: string): Promise<CallToolResult> {
  const studio = await studioOf(directory)
  if (studio === undefined) return text(NO_STUDIO, true)
  try {
    const answer = await askPage(studio, { kind: 'open', path: args.path, workspace: args.workspace })
    if (answer.pages === 0) return text({ opened: false, hint: NO_PAGE, url: studio.url })
    if (answer.outcome === undefined) return text({ opened: false, hint: NO_REPORT })

    return text({ opened: answer.outcome.ok, message: answer.outcome.message }, !answer.outcome.ok)
  } catch (error) {
    return text(`Studio refused: ${messageOf(error)}`, true)
  }
}

/**
 * `studio_pick`: picks a value on a recipe's web page in the Studio the person is looking at, as a click would: they see it selected and the
 * ways to reach it. With `add` it is added to the recipe. Answers with the selector Studio chose and the others it offers.
 *
 * @param args - The recipe and what to pick (a selector or the text shown), and whether to add it.
 * @param directory - Where Studios announce themselves.
 * @returns The MCP tool result.
 */
export async function studioPickTool (args: { recipeId: string, selector?: string, text?: string, add?: boolean }, directory?: string): Promise<CallToolResult> {
  if (args.selector === undefined && args.text === undefined) return text('Give a CSS selector or the text the element shows.', true)
  const studio = await studioOf(directory)
  if (studio === undefined) return text(NO_STUDIO, true)
  try {
    const answer = await askPage(studio, { kind: 'pick', recipeId: args.recipeId, selector: args.selector, text: args.text, add: args.add })
    if (answer.pages === 0) return text({ picked: false, hint: NO_PAGE, url: studio.url }, true)
    if (answer.outcome === undefined) return text({ picked: false, hint: NO_REPORT }, true)

    return text({ picked: answer.outcome.ok, message: answer.outcome.message, ...answer.outcome.detail }, !answer.outcome.ok)
  } catch (error) {
    return text(`Studio refused: ${messageOf(error)}`, true)
  }
}

/**
 * `studio_run_sample`: runs an input recipe as a sample in Studio (the person sees the records arrive), waits for it, and returns the
 * counts and the first records.
 *
 * @param args - The recipe, how many records to stop at and how long to wait.
 * @param directory - Where Studios announce themselves.
 * @returns The MCP tool result.
 */
export async function studioRunSampleTool (args: { recipeId: string, maxRecords?: number, waitSeconds?: number }, directory?: string): Promise<CallToolResult> {
  const studio = await studioOf(directory)
  if (studio === undefined) return text(NO_STUDIO, true)
  try {
    const { folder } = await sendStudioCommand<{ folder?: string }>(studio, { type: 'studio-status' })
    if (folder === undefined) return text('Studio has no folder open yet. Call studio_open_recipe with a recipe file or a folder first.', true)
    await sendStudioCommand(studio, { type: 'run-sample', recipeId: args.recipeId, budget: { maxRecords: args.maxRecords ?? 10 } })
    const deadline = Date.now() + (args.waitSeconds ?? 60) * 1000
    for (;;) {
      const status = await sendStudioCommand<{ state: string }>(studio, { type: 'run-status', recipeId: args.recipeId })
      if (status.state !== 'running') return text(status)
      if (Date.now() >= deadline) return text({ ...status, hint: 'Still running; ask again with studio_run_sample or look in Studio.' })
      await sleep(POLL_MS)
    }
  } catch (error) {
    return text(`Studio could not run it: ${messageOf(error)}`, true)
  }
}
