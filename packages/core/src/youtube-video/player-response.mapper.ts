import type { CaptionTrack, YoutubeVideo } from './youtube-video.contract'

/** What the player response says about one caption track, with the address of its text. */
export interface TrackSource extends CaptionTrack {
  url: string
}

type Json = Record<string, unknown>

function objectOf (value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : undefined
}

function textOf (value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberOf (value: unknown): number {
  const number = Number(value)

  return Number.isFinite(number) ? number : 0
}

/** A YouTube text: a plain string, `{ simpleText }` or `{ runs: [{ text }] }`. */
function labelOf (value: unknown): string {
  if (typeof value === 'string') return value
  const label = objectOf(value)
  if (label === undefined) return ''
  if (typeof label.simpleText === 'string') return label.simpleText
  if (!Array.isArray(label.runs)) return ''

  return label.runs.map(run => textOf(objectOf(run)?.text)).join('')
}

/**
 * Why a video cannot be played, when it cannot.
 *
 * @param player - The player response.
 * @returns The status and reason YouTube gives, or `undefined` when the video plays.
 */
export function unplayableReason (player: unknown): { status: string, reason: string } | undefined {
  const playability = objectOf(objectOf(player)?.playabilityStatus)
  const status = textOf(playability?.status)
  if (status === 'OK') return undefined

  return { status: status === '' ? 'UNKNOWN' : status, reason: textOf(playability?.reason) }
}

/**
 * The caption tracks a player response lists.
 *
 * @param player - The player response.
 * @returns Each track with its language, name, whether it is automatic or translatable, and where its text is.
 */
export function trackSources (player: unknown): TrackSource[] {
  const tracks = objectOf(objectOf(objectOf(player)?.captions)?.playerCaptionsTracklistRenderer)?.captionTracks
  if (!Array.isArray(tracks)) return []

  return tracks.flatMap((entry) => {
    const track = objectOf(entry)
    const language = textOf(track?.languageCode)
    const url = textOf(track?.baseUrl)
    if (track === undefined || language === '' || url === '') return []

    return [{ language, name: labelOf(track.name) || language, auto: track.kind === 'asr', translatable: track.isTranslatable === true, url }]
  })
}

/** The languages YouTube says a track can be translated to, when the response lists them. */
export function translationLanguages (player: unknown): { language: string, name: string }[] | undefined {
  const languages = objectOf(objectOf(objectOf(player)?.captions)?.playerCaptionsTracklistRenderer)?.translationLanguages
  if (!Array.isArray(languages)) return undefined

  return languages.flatMap((entry) => {
    const language = objectOf(entry)
    const code = textOf(language?.languageCode)

    return code === '' ? [] : [{ language: code, name: labelOf(language?.languageName) || code }]
  })
}

/**
 * What a player response says about the video itself.
 *
 * @param player - The player response.
 * @param videoId - The id asked for, used when the response does not repeat it.
 * @returns The video without its captions and transcript.
 */
export function videoDetails (player: unknown, videoId: string): Omit<YoutubeVideo, 'captions' | 'translations' | 'transcript'> {
  const details = objectOf(objectOf(player)?.videoDetails)
  const microformat = objectOf(objectOf(objectOf(player)?.microformat)?.playerMicroformatRenderer)
  const thumbnails = objectOf(details?.thumbnail)?.thumbnails
  const widest = Array.isArray(thumbnails)
    ? thumbnails.map(thumbnail => objectOf(thumbnail)).filter((thumbnail): thumbnail is Json => thumbnail !== undefined).sort((a, b) => numberOf(b.width) - numberOf(a.width))[0]
    : undefined
  const id = textOf(details?.videoId) || videoId
  const publishDate = textOf(microformat?.publishDate) || textOf(microformat?.uploadDate)
  const category = textOf(microformat?.category)
  const thumbnail = textOf(widest?.url)

  return {
    videoId:       id,
    url:           `https://www.youtube.com/watch?v=${id}`,
    title:         textOf(details?.title),
    author:        textOf(details?.author),
    channelId:     textOf(details?.channelId),
    description:   textOf(details?.shortDescription),
    lengthSeconds: numberOf(details?.lengthSeconds),
    viewCount:     numberOf(details?.viewCount),
    keywords:      Array.isArray(details?.keywords) ? details.keywords.filter((keyword): keyword is string => typeof keyword === 'string') : [],
    isLive:        details?.isLiveContent === true || details?.isLive === true,
    ...(publishDate !== '' && { publishDate }),
    ...(category !== '' && { category }),
    ...(thumbnail !== '' && { thumbnail }),
  }
}
