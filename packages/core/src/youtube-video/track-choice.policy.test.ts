import { chooseTrack } from './track-choice.policy'
import type { CaptionTrack } from './youtube-video.contract'

const track = (language: string, auto = false): CaptionTrack => ({ language, name: language, auto, translatable: true })

describe('chooseTrack', () => {
  it('takes the first track the uploader wrote when no language is asked for, else the first automatic one', () => {
    expect(chooseTrack([track('en', true), track('de'), track('fr')])?.language).toBe('de')
    expect(chooseTrack([track('en', true), track('de', true)])?.language).toBe('en')
    expect(chooseTrack([])).toBeUndefined()
  })

  it('takes the language asked for: an exact match first, then one of the same base language, a written track before an automatic one', () => {
    const tracks = [track('pt', true), track('pt-BR'), track('en-GB'), track('es-419')]

    expect(chooseTrack(tracks, 'pt-BR')?.language).toBe('pt-BR')
    expect(chooseTrack(tracks, 'PT-br')?.language).toBe('pt-BR')
    expect(chooseTrack(tracks, 'pt')?.language).toBe('pt')
    expect(chooseTrack([track('pt', true), track('pt-BR')], 'pt-PT')?.language).toBe('pt-BR')
    expect(chooseTrack(tracks, 'en')?.language).toBe('en-GB')
    expect(chooseTrack(tracks, 'es_MX')?.language).toBe('es-419')
    expect(chooseTrack(tracks, 'ja')).toBeUndefined()
  })
})
