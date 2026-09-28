import { createStudioClient } from './studio-client'

function withUrl (search: string): void {
  history.replaceState({}, '', `/${search}`)
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

  it('sends save-outline as a POST with the path and the outline', async () => {
    withUrl('?token=abc123')
    const fetchMock = mockFetch({ ok: true, status: 200, body: { saved: true } })
    const outline = { recipe: {}, steps: [] }

    const client = createStudioClient()
    await client.saveOutline('/r/books.input.json', outline)

    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      method: 'POST',
      body:   JSON.stringify({ type: 'save-outline', path: '/r/books.input.json', outline }),
    }))
  })

  it('sends take-snapshot as a POST with the recipe id and step path', async () => {
    withUrl('?token=abc123')
    const fetchMock = mockFetch({ ok: true, status: 200, body: { html: '<html></html>', nodeCount: 1, baseUrl: 'https://x/' } })

    const client = createStudioClient()
    const view = await client.takeSnapshot('books', 'start')

    expect(view).toEqual({ html: '<html></html>', nodeCount: 1, baseUrl: 'https://x/' })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'take-snapshot', recipeId: 'books', path: 'start' }),
    }))
  })

  it('sends verify-selector as a POST with the selector', async () => {
    withUrl('?token=abc123')
    const fetchMock = mockFetch({ ok: true, status: 200, body: { selector: '.price', snapshotMatches: 1, liveChecked: true, liveMatches: 1 } })

    const client = createStudioClient()
    await client.verifySelector('books', 'start', '.price')

    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'verify-selector', recipeId: 'books', path: 'start', selector: '.price' }),
    }))
  })

  it('sends infer-selector as a POST with one or two node ids', async () => {
    withUrl('?token=abc123')
    const fetchMock = mockFetch({ ok: true, status: 200, body: { kind: 'field', field: { selector: '.price', tier: 'class', take: 'text', matches: 1 } } })

    const client = createStudioClient()
    await client.inferSelector('books', 'start', ['n5'])

    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: ['n5'] }),
    }))
  })

  it('sends explain-why as a POST with the target', async () => {
    withUrl('?token=abc123')
    const fetchMock = mockFetch({ ok: true, status: 200, body: { sentence: '"price" is missing.', field: 'price', recipeId: 'books', outcome: 'missing' } })

    const client = createStudioClient()
    const view = await client.explainWhy({ kind: 'missing', recipeId: 'books', recordIndex: 0, field: 'price' })

    expect(view.sentence).toBe('"price" is missing.')
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'explain-why', target: { kind: 'missing', recipeId: 'books', recordIndex: 0, field: 'price' } }),
    }))
  })

  it('sends start-recording as a POST with the recipe id', async () => {
    withUrl('?token=abc123')
    const fetchMock = mockFetch({ ok: true, status: 200, body: { started: true } })

    const client = createStudioClient()
    const result = await client.startRecording('login')

    expect(result).toEqual({ started: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'start-recording', recipeId: 'login' }),
    }))
  })

  it('sends stop-recording as a POST and returns the recorded steps', async () => {
    withUrl('?token=abc123')
    const fetchMock = mockFetch({ ok: true, status: 200, body: { steps: [{ type: 'fill', selector: '#user', value: 'alice' }] } })

    const client = createStudioClient()
    const result = await client.stopRecording()

    expect(result).toEqual({ steps: [{ type: 'fill', selector: '#user', value: 'alice' }] })
    expect(fetchMock).toHaveBeenCalledWith('/api/command?token=abc123', expect.objectContaining({
      body: JSON.stringify({ type: 'stop-recording' }),
    }))
  })

  it('rejects with the server\'s error message on a non-ok response', async () => {
    withUrl('?token=abc123')
    mockFetch({ ok: false, status: 401, body: { error: 'missing or invalid token' } })

    const client = createStudioClient()
    await expect(client.openWorkspace('recipes')).rejects.toThrow('missing or invalid token')
  })
})
