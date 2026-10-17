import { trackSources, translationLanguages, unplayableReason, videoDetails } from './player-response.mapper'
import { chooseTrack } from './track-choice.policy'
import { transcriptSegments } from './transcript.mapper'
import { videoIdOf } from './video-id.algorithm'
import type { Transcript, YoutubeOptions, YoutubeTransport, YoutubeVideo } from './youtube-video.contract'
import { YoutubeError } from './youtube.error'

/** YouTube's own player endpoint, asked as its Android app asks: the answer lists the caption tracks with addresses that work without a token. */
const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'
const CLIENT = { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en', gl: 'US' }
const USER_AGENT = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip'
const PLAYER_HEADERS = { 'content-type': 'application/json', 'user-agent': USER_AGENT, 'x-youtube-client-name': '3', 'x-youtube-client-version': CLIENT.clientVersion }

/** What reading a video gave, and what it noticed but read anyway. */
export interface YoutubeReading {
  video:    YoutubeVideo
  warnings: string[]
}

/** A track's text address asking for `json3` (and a translation, when asked): any format the address already names is replaced. */
function transcriptUrl (trackUrl: string, translateTo: string | undefined): string {
  const kept = trackUrl.split('&').filter(part => !part.startsWith('fmt=') && !part.startsWith('tlang='))

  return `${kept.join('&')}&fmt=json3${translateTo === undefined ? '' : `&tlang=${encodeURIComponent(translateTo)}`}`
}

async function readTranscript (url: string, transport: YoutubeTransport, translating: string | undefined, available: string): Promise<unknown> {
  const { status, text } = await transport.getText(url, { 'user-agent': USER_AGENT })
  if (translating !== undefined && status >= 400) {
    throw new YoutubeError(`YouTube would not translate the transcript to "${translating}" (it answered ${String(status)}): machine translation needs a token only a signed-in browser has. Read a track the video has instead, with "language": its tracks are ${available}`)
  }
  if (status >= 400) throw new YoutubeError(`YouTube answered ${String(status)} for the transcript`)
  const body = text.trim()
  if (body === '') throw new YoutubeError('YouTube sent no transcript for this track: it may need a signed-in session')
  if (body.startsWith('<')) throw new YoutubeError('YouTube sent a web page instead of the transcript: it asked for a captcha or turned the request away as automated. Try again later, or from another network')
  try {
    return JSON.parse(body)
  } catch (error) {
    throw new YoutubeError(`YouTube's transcript could not be read: ${(error as Error).message}`, { cause: error })
  }
}

/**
 * Reads a YouTube video as a document: what the page says about it (title, channel, description, length, views, keywords, thumbnail), the caption
 * tracks it has and, unless told not to, the transcript of one of them, with the time of every line, in its own language or translated by YouTube.
 * It asks YouTube's player endpoint the way the Android app does, then fetches the track's text; nothing is scraped from the watch page.
 *
 * @param input - A YouTube address (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`) or a video id.
 * @param options - The transcript's language, a translation, or no transcript.
 * @param transport - Makes the two requests.
 * @returns The video and what reading it noticed.
 * @throws YoutubeError when the input is not a video, the video cannot be played (private, removed, age-restricted, region-locked), the language asked for does not exist, or YouTube turns the request away.
 */
export async function readYoutubeVideo (input: string, options: YoutubeOptions, transport: YoutubeTransport): Promise<YoutubeReading> {
  const videoId = videoIdOf(input)
  if (videoId === undefined) throw new YoutubeError(`"${input}" is not a YouTube video: give a watch address (https://www.youtube.com/watch?v=…), a youtu.be link, a Shorts address or the video id`)
  const { status, json: player } = await transport.postJson(PLAYER_URL, PLAYER_HEADERS, { context: { client: CLIENT }, videoId, contentCheckOk: true, racyCheckOk: true })
  if (status >= 400) throw new YoutubeError(`YouTube answered ${String(status)} for the video ${videoId}`)
  const unplayable = unplayableReason(player)
  if (unplayable !== undefined) {
    const hint = unplayable.status === 'LOGIN_REQUIRED' ? ' (it needs a signed-in session: it may be private or age-restricted, or YouTube asks for a bot check)' : ''
    throw new YoutubeError(`YouTube will not play ${videoId}: ${unplayable.status}${unplayable.reason === '' ? '' : ` - ${unplayable.reason}`}${hint}`)
  }
  const tracks = trackSources(player)
  const translations = translationLanguages(player)
  const video: YoutubeVideo = {
    ...videoDetails(player, videoId),
    captions: tracks.map(({ language, name, auto, translatable }) => ({ language, name, auto, translatable })),
    ...(translations !== undefined && translations.length > 0 && { translations }),
  }
  const warnings: string[] = []
  if (options.transcript === false) return { video, warnings }
  if (tracks.length === 0) return { video, warnings: ['this video has no captions, so there is no transcript'] }
  const available = tracks.map(candidate => `${candidate.language}${candidate.auto ? ' (auto-generated)' : ''}`).join(', ')
  // A translation into a language the video already has a track for is that track: what the uploader wrote beats a machine translation.
  const native = options.translateTo === undefined ? undefined : chooseTrack(tracks, options.translateTo)
  const track = native ?? chooseTrack(tracks, options.language)
  if (track === undefined) throw new YoutubeError(`the video has no captions in "${options.language ?? ''}": its tracks are ${available}`)
  const translateTo = native === undefined ? options.translateTo : undefined
  if (translateTo !== undefined && !track.translatable) throw new YoutubeError(`the ${track.language} captions cannot be translated: YouTube does not offer a translation of this track`)
  const segments = transcriptSegments(await readTranscript(transcriptUrl(track.url, translateTo), transport, translateTo, available))
  if (segments.length === 0) warnings.push('the transcript is empty')
  const transcript: Transcript = {
    language: translateTo ?? track.language,
    name:     track.name,
    auto:     track.auto,
    ...(translateTo !== undefined && { translatedTo: translateTo }),
    segments,
    text:     segments.map(segment => segment.text).join('\n'),
  }

  return { video: { ...video, transcript }, warnings }
}
