/** A YouTube video that could not be read, with what to do about it. */
export class YoutubeError extends Error {
  override readonly name = 'YoutubeError'
}
