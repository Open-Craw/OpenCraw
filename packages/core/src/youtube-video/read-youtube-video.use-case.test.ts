import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readYoutubeVideo } from './read-youtube-video.use-case'
import type { YoutubeOptions, YoutubeTransport } from './youtube-video.contract'

function fixture (name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as unknown
}

const PLAYER = fixture('player-response.json')
const TRANSCRIPT = fixture('transcript-en.json3.json')
const URL_OF_VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'

interface Calls {
  posts: { url: string, headers: Record<string, string>, body: unknown }[]
  gets:  string[]
}

/** A transport that answers with the captured player response and transcript, and remembers what it was asked. */
function transport (answers: { player?: unknown, playerStatus?: number, transcript?: { status?: number, text: string } } = {}): { transport: YoutubeTransport, calls: Calls } {
  const calls: Calls = { posts: [], gets: [] }

  return {
    calls,
    transport: {
      postJson: (url, headers, body) => {
        calls.posts.push({ url, headers, body })

        return Promise.resolve({ status: answers.playerStatus ?? 200, json: 'player' in answers ? answers.player : PLAYER })
      },
      getText: (url) => {
        calls.gets.push(url)
        const transcript = answers.transcript ?? { text: JSON.stringify(TRANSCRIPT) }

        return Promise.resolve({ status: transcript.status ?? 200, text: transcript.text })
      },
    },
  }
}

async function read (options: YoutubeOptions = {}, answers: Parameters<typeof transport>[0] = {}): Promise<{ video: Awaited<ReturnType<typeof readYoutubeVideo>>['video'], warnings: string[], calls: Calls }> {
  const { transport: fake, calls } = transport(answers)
  const { video, warnings } = await readYoutubeVideo(URL_OF_VIDEO, options, fake)

  return { video, warnings, calls }
}

describe('readYoutubeVideo', () => {
  it('reads what the page says about the video, its caption tracks and the transcript with the time of every line', async () => {
    const { video, warnings } = await read()

    expect(warnings).toEqual([])
    expect(video).toMatchObject({
      videoId:       'jNQXAC9IVRw',
      url:           URL_OF_VIDEO,
      title:         'Me at the zoo',
      author:        'jawed',
      channelId:     'UC4QobU6STFB0P71PMvOGN5A',
      lengthSeconds: 19,
      keywords:      ['me at the zoo', 'jawed karim', 'first youtube video'],
      isLive:        false,
    })
    expect(video.viewCount).toBeGreaterThan(400_000_000)
    expect(video.thumbnail).toContain('hqdefault.jpg')
    expect(video.captions).toEqual([{ language: 'en', name: 'English', auto: false, translatable: true }, { language: 'de', name: 'German', auto: false, translatable: true }])
    expect(video.transcript?.language).toBe('en')
    expect(video.transcript?.auto).toBe(false)
    expect(video.transcript?.segments).toHaveLength(6)
    expect(video.transcript?.segments[0]).toEqual({ start: 1.2, duration: 2.16, text: 'All right, so here we are, in front of the elephants' })
    expect(video.transcript?.segments[5]).toEqual({ start: 16.881, duration: 2, text: 'and that\'s pretty much all there is to say' })
    expect(video.transcript?.text.split('\n', 3)[2]).toBe('really really long trunks')
  })

  it('asks the player endpoint as the Android app does, for the id in the address, and the track as json3', async () => {
    const { calls } = await read()

    expect(calls.posts).toHaveLength(1)
    expect(calls.posts[0].url).toContain('/youtubei/v1/player')
    expect(calls.posts[0].headers['user-agent']).toContain('com.google.android.youtube')
    expect(calls.posts[0].body).toMatchObject({ videoId: 'jNQXAC9IVRw', context: { client: { clientName: 'ANDROID' } } })
    expect(calls.gets).toHaveLength(1)
    expect(calls.gets[0]).toMatch(/lang=en&fmt=json3$/)
    expect(calls.gets[0]).not.toContain('fmt=srv3')
  })

  it('reads the transcript in the language asked for: exact, then the same base language', async () => {
    const german = await read({ language: 'de' })
    expect(german.video.transcript?.language).toBe('de')
    expect(german.calls.gets[0]).toContain('lang=de')

    const regional = await read({ language: 'en-US' })
    expect(regional.video.transcript?.language).toBe('en')
  })

  it('says which tracks there are when the language asked for is not one of them', async () => {
    await expect(read({ language: 'ja' })).rejects.toThrow(/no captions in "ja": its tracks are en, de/)
  })

  it('has YouTube translate the transcript when asked, and says so', async () => {
    const { video, calls } = await read({ translateTo: 'pt' })

    expect(calls.gets[0]).toMatch(/fmt=json3&tlang=pt$/)
    expect(video.transcript).toMatchObject({ language: 'pt', translatedTo: 'pt', name: 'English' })
  })

  it('uses the video\'s own track when translating to a language it has one for, without asking YouTube to translate', async () => {
    const { video, calls } = await read({ translateTo: 'de' })

    expect(calls.gets[0]).toMatch(/lang=de&fmt=json3$/)
    expect(calls.gets[0]).not.toContain('tlang')
    expect(video.transcript).toMatchObject({ language: 'de', name: 'German' })
    expect(video.transcript?.translatedTo).toBeUndefined()
  })

  it('says what to do when YouTube refuses the machine translation, naming the tracks the video has', async () => {
    await expect(read({ translateTo: 'pt' }, { transcript: { status: 429, text: '<html>Sorry</html>' } })).rejects.toThrow(/would not translate the transcript to "pt" \(it answered 429\).*token.*its tracks are en, de/)
  })

  it('refuses to translate a track YouTube does not translate', async () => {
    const player = JSON.parse(JSON.stringify(PLAYER).replaceAll('"isTranslatable":true', '"isTranslatable":false')) as unknown

    await expect(read({ translateTo: 'pt' }, { player })).rejects.toThrow(/cannot be translated/)
  })

  it('reads only what is about the video when told not to read the transcript', async () => {
    const { video, calls } = await read({ transcript: false })

    expect(video.title).toBe('Me at the zoo')
    expect(video.transcript).toBeUndefined()
    expect(video.captions).toHaveLength(2)
    expect(calls.gets).toEqual([])
  })

  it('notes a video with no captions instead of failing, and lists the languages YouTube translates to when it says', async () => {
    const none = structuredClone(PLAYER) as { captions?: unknown }
    delete none.captions
    const withoutCaptions = await read({}, { player: none })
    expect(withoutCaptions.video.captions).toEqual([])
    expect(withoutCaptions.warnings).toEqual(['this video has no captions, so there is no transcript'])

    const listed = structuredClone(PLAYER) as { captions: { playerCaptionsTracklistRenderer: Record<string, unknown> } }
    listed.captions.playerCaptionsTracklistRenderer.translationLanguages = [{ languageCode: 'af', languageName: { simpleText: 'Afrikaans' } }, { languageCode: 'es', languageName: { runs: [{ text: 'Spanish' }] } }]
    const withLanguages = await read({}, { player: listed })
    expect(withLanguages.video.translations).toEqual([{ language: 'af', name: 'Afrikaans' }, { language: 'es', name: 'Spanish' }])
  })

  it('prefers a track the uploader wrote over an automatic one', async () => {
    const mixed = structuredClone(PLAYER) as { captions: { playerCaptionsTracklistRenderer: { captionTracks: Record<string, unknown>[] } } }
    const [english, german] = mixed.captions.playerCaptionsTracklistRenderer.captionTracks
    mixed.captions.playerCaptionsTracklistRenderer.captionTracks = [{ ...english, kind: 'asr' }, german]
    const { video } = await read({}, { player: mixed })

    expect(video.transcript?.language).toBe('de')
    expect(video.captions[0]).toMatchObject({ language: 'en', auto: true })
  })

  it('says why a video cannot be read: unavailable, or needing a sign-in', async () => {
    const unavailable = { playabilityStatus: { status: 'ERROR', reason: 'Video unavailable' } }
    const login = { playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' } }

    await expect(read({}, { player: unavailable })).rejects.toThrow('YouTube will not play jNQXAC9IVRw: ERROR - Video unavailable')
    await expect(read({}, { player: login })).rejects.toThrow(/LOGIN_REQUIRED - Sign in to confirm your age \(it needs a signed-in session/)
    await expect(read({}, { player: {}, playerStatus: 200 })).rejects.toThrow(/UNKNOWN/)
    await expect(read({}, { playerStatus: 429 })).rejects.toThrow('YouTube answered 429 for the video')
  })

  it('says what went wrong with the transcript: a status, nothing, a web page, something that is not JSON', async () => {
    await expect(read({}, { transcript: { status: 429, text: '' } })).rejects.toThrow('YouTube answered 429 for the transcript')
    await expect(read({}, { transcript: { text: ' '.repeat(3) } })).rejects.toThrow('sent no transcript')
    await expect(read({}, { transcript: { text: '<html><title>Sorry...</title></html>' } })).rejects.toThrow(/captcha or turned the request away/)
    await expect(read({}, { transcript: { text: 'not json' } })).rejects.toThrow('could not be read')
  })

  it('warns, and still returns the video, when the transcript has no lines', async () => {
    const { video, warnings } = await read({}, { transcript: { text: JSON.stringify({ events: [{ tStartMs: 0 }] }) } })

    expect(video.transcript?.segments).toEqual([])
    expect(warnings).toEqual(['the transcript is empty'])
  })

  it('refuses an input that is not a YouTube video, before asking anything', async () => {
    const { transport: fake, calls } = transport()

    await expect(readYoutubeVideo('https://example.com/watch?v=jNQXAC9IVRw', {}, fake)).rejects.toThrow(/is not a YouTube video/)
    expect(calls.posts).toEqual([])
  })
})
