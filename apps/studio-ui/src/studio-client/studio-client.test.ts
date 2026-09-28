import { createStudioClient } from './studio-client'

function withUrl (search: string): void {
  globalThis.history.replaceState({}, '', `/${search}`)
}

function mockFetch (response: { ok: boolean, status: number, body: unknown }): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok: response.ok, status: response.status, json: async () => response.body })
  Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true })

  return fetchMock
}

describe('createStudioClient', () => {
  it('reads the token and the folder from the page URL', () => {
    withUrl('?token=abc123&folder=recipes')
    const client = createStudioClient()
    expect(client.token).toBe('abc123')
    expect(client.initialFolder).toBe('recipes')
  })

  it('sends open-workspace as a POST with the token on the query string', async () => {
    withUrl('?token=abc123')
    const fetchMock = mockFetch({ ok: true, status: 200, body: { folder: 'recipes', recipes: [] } })

    const client = createStudioClient()
    const view = await client.openWorkspace('recipes')

    expect(view).toEqual({ folder: 'recipes', recipes: [] })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      method: 'POST',
      body:   JSON.stringify({ type: 'open-workspace', folder: 'recipes' }),
    }))
  })

  it('rejects with the server\'s error message on a non-ok response', async () => {
    withUrl('?token=abc123')
    mockFetch({ ok: false, status: 401, body: { error: 'missing or invalid token' } })

    const client = createStudioClient()
    await expect(client.openWorkspace('recipes')).rejects.toThrow('missing or invalid token')
  })
})
