import type { CaptionTrack } from './youtube-video.contract'

/** The base of a language code: `pt` of `pt-BR`. */
function baseOf (language: string): string {
  return language.toLowerCase().split(/[-_]/, 1)[0]
}

/**
 * The caption track to read the transcript from. With a language asked for, the track in that language: an exact match first, then one of the
 * same base language (`pt` finds `pt-BR`, `en-US` finds `en`), a track the uploader wrote before an automatic one. Without, the first track the
 * uploader wrote, else the first automatic one.
 *
 * @param tracks - The video's tracks, in YouTube's order.
 * @param language - The language asked for, if any.
 * @returns The track, or `undefined` when there is none (no tracks, or none in that language).
 */
export function chooseTrack<T extends CaptionTrack> (tracks: readonly T[], language?: string): T | undefined {
  const written = tracks.filter(track => !track.auto)
  const ordered = [...written, ...tracks.filter(track => track.auto)]
  if (language === undefined) return ordered[0]
  const wanted = language.toLowerCase()

  return ordered.find(track => track.language.toLowerCase() === wanted) ?? ordered.find(track => baseOf(track.language) === baseOf(wanted))
}
