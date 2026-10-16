import { HttpClient } from '@opencraw/core'

/** The most of a body that is looked at: JSON that starts here is JSON, and a page is not downloaded in full to find out it is not. */
const LOOKED_AT = 2_000_000

/**
 * Whether an address returns JSON: what its content type says, or, for an API that serves JSON as `text/plain`
 * (common), a body that parses as an object or an array. An address that cannot be fetched is not JSON; the
 * recipe started from it then reports why on its first snapshot.
 *
 * @param url - The address.
 * @returns `true` when the body is JSON.
 */
export async function detectJsonUrl (url: string): Promise<boolean> {
  const client = await HttpClient.open({})
  try {
    const { body } = await client.send({ url })
    if (body.kind === 'json') return true
    if (body.kind !== 'text') return false
    const start = body.text.trimStart()
    if (!start.startsWith('{') && !start.startsWith('[')) return false
    try {
      JSON.parse(body.text.slice(0, LOOKED_AT))

      return true
    } catch {
      return false
    }
  } catch {
    return false
  } finally {
    await client.dispose()
  }
}
