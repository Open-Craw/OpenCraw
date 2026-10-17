import { videoIdOf } from './video-id.algorithm'

describe('videoIdOf', () => {
  it('reads the id from every address a video has', () => {
    const id = 'jNQXAC9IVRw'
    expect(videoIdOf(`https://www.youtube.com/watch?v=${id}`)).toBe(id)
    expect(videoIdOf(`https://www.youtube.com/watch?feature=share&v=${id}&t=5s`)).toBe(id)
    expect(videoIdOf(`https://m.youtube.com/watch?v=${id}`)).toBe(id)
    expect(videoIdOf(`https://music.youtube.com/watch?v=${id}`)).toBe(id)
    expect(videoIdOf(`https://youtu.be/${id}?si=abc`)).toBe(id)
    expect(videoIdOf(`https://www.youtube.com/shorts/${id}`)).toBe(id)
    expect(videoIdOf(`https://www.youtube.com/embed/${id}`)).toBe(id)
    expect(videoIdOf(`https://www.youtube-nocookie.com/embed/${id}`)).toBe(id)
    expect(videoIdOf(`https://www.youtube.com/live/${id}`)).toBe(id)
  })

  it('takes a bare id, with its dash and underscore', () => {
    expect(videoIdOf('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(videoIdOf(' a-b_c-d_e-f ')).toBe('a-b_c-d_e-f')
  })

  it('says nothing for what is not a video: another host, a channel, a playlist, a short word', () => {
    expect(videoIdOf('https://example.com/watch?v=jNQXAC9IVRw')).toBeUndefined()
    expect(videoIdOf('https://www.youtube.com/@channel')).toBeUndefined()
    expect(videoIdOf('https://www.youtube.com/playlist?list=PL1234567890')).toBeUndefined()
    expect(videoIdOf('https://www.youtube.com/watch?v=short')).toBeUndefined()
    expect(videoIdOf('hello')).toBeUndefined()
    expect(videoIdOf('')).toBeUndefined()
  })
})
