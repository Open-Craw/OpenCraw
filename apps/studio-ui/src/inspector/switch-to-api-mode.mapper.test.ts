import type { ObservedResponseView } from '@opencraw/studio'
import { apiModeFromResponse } from './switch-to-api-mode.mapper'

function response (url: string): ObservedResponseView {
  return { url, status: 200, size: 512, shape: 'array (3) of object' }
}

describe('apiModeFromResponse', () => {
  it('switches to api mode, starting from the response url, with a request step reading it as JSON', () => {
    const patch = apiModeFromResponse(response('http://x/api/products'), undefined)
    expect(patch).toEqual({
      mode:  'api',
      start: [{ url: 'http://x/api/products' }],
      steps: [{ type: 'request', id: 'response', url: '{{start.url}}', as: 'json' }],
    })
  })

  it('templates a query value that matches a var, leaving others as they are', () => {
    const patch = apiModeFromResponse(response('http://x/api/products?page=1&category=shoes'), { page: 1, locale: 'en' })
    expect(patch.start[0].url).toBe('http://x/api/products?page={{vars.page}}&category=shoes')
  })

  it('does not percent-encode the template braces', () => {
    const patch = apiModeFromResponse(response('http://x/api?user=demo'), { user: 'demo' })
    expect(patch.start[0].url).not.toContain('%7B')
    expect(patch.start[0].url).toBe('http://x/api?user={{vars.user}}')
  })
})
