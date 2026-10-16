import { detectJsonUrl } from '../page-snapshot'
import type { DetectUrlCommand, DetectUrlView } from '../studio-api'

/**
 * Handles `detect-url`: whether the address returns JSON, for "Load ▾ Web page" to start an API recipe (a request read as JSON, with the
 * JSON tree to pick from) instead of a browser recipe over the text of the response.
 *
 * @param command - The address.
 * @returns Whether it is JSON.
 */
export async function handleDetectUrl (command: DetectUrlCommand): Promise<DetectUrlView> {
  return { json: await detectJsonUrl(command.url) }
}
