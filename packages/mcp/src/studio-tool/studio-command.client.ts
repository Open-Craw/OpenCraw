import type { StudioInstance } from './studio-instance.repository'

/**
 * Sends one command to a running Studio (`POST /api/command`, the same door its own page uses) and reads the answer.
 *
 * @param instance - The Studio to talk to.
 * @param command - A command `@opencraw/studio`'s `studioCommandSchema` accepts.
 * @returns The JSON the Studio answered.
 * @throws Error with the Studio's own message when it refuses.
 */
export async function sendStudioCommand<T> (instance: StudioInstance, command: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${instance.url}/api/command`, {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-opencraw-token': instance.token },
    body:    JSON.stringify(command),
  })
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Studio answered ${String(response.status)}`)

  return body
}
