import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startStudioServer } from '../src/studio-server'
import { browserConfig } from './fixture-site'

describe('studio error messages (issue #187)', () => {
  it('a snapshot that cannot connect reports plain text, without Playwright\'s ANSI colour codes', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-errors-'))
    cpSync(join(__dirname, 'recipes-picking'), folder, { recursive: true })
    const file = join(folder, 'books.input.json')
    const recipe = JSON.parse(readFileSync(file, 'utf8')) as { start: { url: string }[] }
    recipe.start = [{ url: 'http://127.0.0.1:4598/nothing-listens-here' }]
    writeFileSync(file, JSON.stringify(recipe))
    const uiRoot = mkdtempSync(join(tmpdir(), 'opencraw-e2e-ui-'))
    const server = await startStudioServer({ uiRoot, browser: browserConfig() })
    try {
      const url = `http://127.0.0.1:${new URL(server.url).port}/api/command`
      const headers = { 'content-type': 'application/json', 'x-opencraw-token': server.token }
      const send = (body: unknown): Promise<Response> => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      await send({ type: 'open-workspace', folder })
      const response = await send({ type: 'take-snapshot', recipeId: 'books', path: 'start' })
      const { error } = await response.json() as { error: string }

      expect(response.status).toBe(500)
      expect(error).toContain('ERR_CONNECTION_REFUSED')
      expect(error).not.toContain('\u{1B}')
    } finally {
      await server.close()
    }
  }, 60000)
})
