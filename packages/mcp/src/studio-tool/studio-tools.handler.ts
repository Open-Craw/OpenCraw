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

/** Input schema for `studio_run_sample`. */
export const studioRunSampleInputShape = {
  recipeId:    z.string().min(1).describe('The id of an input recipe in the folder Studio has open.'),
  maxRecords:  z.number().int().positive().optional().describe('Stop after this many records. Default 10.'),
  waitSeconds: z.number().int().positive().max(300).optional().describe('How long to wait for the run to finish before answering that it is still running. Default 60.'),
}

const NO_STUDIO = 'No Studio is running. Start one with `opencraw studio <folder>`, or open a recipe from the OpenCraw view in VS Code ("Open in Studio"), then ask again.'
const POLL_MS = 500

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
    const { pages } = await sendStudioCommand<{ pages: number }>(studio, { type: 'ask-ui', request: { kind: 'open', path: args.path, workspace: args.workspace } })

    if (pages === 0) return text({ opened: false, hint: 'Studio is running but no page is open on it. Ask the person to open Studio in their browser.', url: studio.url })

    return text({ opened: true, pages })
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
      await new Promise<void>((resolve) => { setTimeout(resolve, POLL_MS) })
    }
  } catch (error) {
    return text(`Studio could not run it: ${messageOf(error)}`, true)
  }
}
