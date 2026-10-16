import { detectUrlKind } from '../page-snapshot'
import type { DetectUrlCommand, DetectUrlView } from '../studio-api'

/**
 * Handles `detect-url`: what the address returns, for "Load ▾ Web page" to start a recipe that reads a document (a JSON API, a PDF,
 * a spreadsheet, Markdown...) instead of a browser recipe over a response that is not a page.
 *
 * @param command - The address.
 * @returns What it returns.
 */
export async function handleDetectUrl (command: DetectUrlCommand): Promise<DetectUrlView> {
  return { kind: await detectUrlKind(command.url) }
}
