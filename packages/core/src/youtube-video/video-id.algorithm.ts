const ID = /^[\w-]{11}$/

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com', 'youtu.be'])

/** The folders whose next segment is a video id: `/shorts/ID`, `/embed/ID`, `/live/ID`, `/v/ID`. */
const ID_FOLDERS = new Set(['shorts', 'embed', 'live', 'v'])

/**
 * The id of the video a YouTube address or a bare id names.
 *
 * @param input - `https://www.youtube.com/watch?v=ID`, `https://youtu.be/ID`, `/shorts/ID`, `/embed/ID`, `/live/ID`, or the 11-character id itself.
 * @returns The id, or `undefined` when the input does not name a video.
 */
export function videoIdOf (input: string): string | undefined {
  const text = input.trim()
  if (ID.test(text)) return text
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return undefined
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return undefined
  const [first, second] = url.pathname.split('/').filter(part => part !== '')
  let candidate: string | undefined
  if (url.hostname.toLowerCase() === 'youtu.be') candidate = first
  else if (first === 'watch') candidate = url.searchParams.get('v') ?? undefined
  else if (first !== undefined && ID_FOLDERS.has(first)) candidate = second

  return candidate !== undefined && ID.test(candidate) ? candidate : undefined
}
