import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { openRecorderSession } from '../src/flow-recording'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { OutlineNode, RecordingNoteEvent } from '../src/studio-api'
import { FIXTURE_BASE, LOGIN_PASS, LOGIN_USER, browserConfig, startFixtureSite, stopFixtureSite } from './fixture-site'

const RECIPES_FOLDER = join(__dirname, 'recipes-recording')

function recipesFolder (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-recording-'))
  cpSync(RECIPES_FOLDER, folder, { recursive: true })

  return folder
}

function emptyUiRoot (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-e2e-ui-'))
}

/** A fresh recorder profile directory per test: the studio's own, never a crawl's own, never the person's default browser (issue #95). */
function recorderProfileDir (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-e2e-recorder-profile-'))
}

function commandUrl (server: StudioServer): string {
  return `http://127.0.0.1:${new URL(server.url).port}/api/command`
}

async function post<T> (server: StudioServer, body: unknown): Promise<T> {
  const response = await fetch(commandUrl(server), {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-opencraw-token': server.token },
    body:    JSON.stringify(body),
  })
  if (response.status !== 200) {
    const text = await response.text()
    throw new Error(`${response.status} on ${JSON.stringify(body)}: ${text}`)
  }

  return response.json() as Promise<T>
}

describe('studio phase 6: recording flows (#95)', () => {
  let site: Server

  beforeAll(async () => { site = await startFixtureSite() })
  afterAll(async () => { await stopFixtureSite(site) })

  it('start-recording/stop-recording: the studio opens and closes its own headed window through the HTTP/WS commands, never the crawl\'s own browser profile', async () => {
    const server = await startStudioServer({ uiRoot: emptyUiRoot(), browser: browserConfig(), recorderProfileDir: recorderProfileDir() })
    try {
      const folder = recipesFolder()
      await post(server, { type: 'open-workspace', folder })
      const started = await post<{ started: true }>(server, { type: 'start-recording', recipeId: 'login' })
      expect(started).toEqual({ started: true })
      const stopped = await post<{ steps: unknown[] }>(server, { type: 'stop-recording' })
      expect(stopped.steps).toEqual([]) // the window opened, but nothing was ever recorded on it
    } finally {
      await server.close()
    }
  }, 30000)

  it(
    'records a login and a search in a headed window — fills, a secret placeholder for the password, a click that navigates, a "next" link offer, the wait it inserts — then "make this the login" and a real run of the result logs in',
    async () => {
      const cards: { node: OutlineNode, secret: boolean }[] = []
      const notes: RecordingNoteEvent[] = []
      const handle = await openRecorderSession(
        { startUrl: `${FIXTURE_BASE}/login`, profileDir: recorderProfileDir(), browser: browserConfig() },
        {
          onCard: (node, secret) => { cards.push({ node, secret }) },
          onNote: (note) => { notes.push({ type: 'recording-note', ...note }) },
        },
      )
      const page = handle.page

      // The login: two fills (the second a password field), a click that submits and navigates.
      await page.click('#user')
      await page.fill('#user', LOGIN_USER)
      await page.click('#pass')
      await page.fill('#pass', LOGIN_PASS)
      await page.click('#submit')
      await page.waitForURL('**/search')

      // The search: a fill, then Enter to submit the GET form (a page-level key press, issue #95's own example).
      await page.click('#q')
      await page.fill('#q', 'widgets')
      await page.press('#q', 'Enter')
      await page.waitForURL('**/search/results*')

      // A click on the "next" page link: it navigates, and its rel="next" makes it a pagination offer.
      await page.click('#next')
      await page.waitForURL('**page=2**')
      // Let the last binding round trip land before stopping.
      await new Promise(resolve => setTimeout(resolve, 300))
      const { steps } = await handle.stop()

      // 1. The step shapes, in the order the person acted, exactly as issue #95 describes the cards:
      //    Fill, Fill, Click, Wait, Fill, Press, Wait, Click.
      expect(steps.map(step => (step as { type: string }).type)).toEqual(['fill', 'fill', 'click', 'wait', 'fill', 'press', 'wait', 'click'])
      const [fillUser, fillPass, clickSubmit, waitQ, fillQ, pressEnter, waitNext, clickNext] = steps as Record<string, unknown>[]
      expect(fillUser).toEqual({ type: 'fill', selector: '#user', value: LOGIN_USER })
      // 2. The password never appears anywhere: a {{env.NAME}} placeholder instead, named from the field (`pass` -> `PASS`).
      expect(fillPass).toEqual({ type: 'fill', selector: '#pass', value: '{{env.PASS}}' })
      expect(JSON.stringify(steps)).not.toContain(LOGIN_PASS)
      expect(clickSubmit).toMatchObject({ type: 'click' })
      expect(waitQ).toEqual({ type: 'wait', selector: '#q' })
      expect(fillQ).toEqual({ type: 'fill', selector: '#q', value: 'widgets' })
      expect(pressEnter).toEqual({ type: 'press', selector: '#q', key: 'Enter' })
      expect(waitNext).toMatchObject({ type: 'wait', selector: '#next' })
      expect(clickNext).toMatchObject({ type: 'click', selector: '#next' })

      // 3. Every step became a card, secret-flagged exactly on the password fill — never a second card format (`scope-outline`'s own `OutlineCard`).
      expect(cards).toHaveLength(steps.length)
      expect(cards.map(card => card.secret)).toEqual([false, true, false, false, false, false, false, false])
      expect(cards.every(card => card.node.kind === 'card')).toBe(true)

      // 4. The click on the "next" link (rel="next") was offered as a pagination step — issue #95's `next-link.policy.ts` heuristics.
      expect(notes.some(note => note.kind === 'next-link')).toBe(true)

      // 5. "Make this the login": the login's own steps (through the submit click) become `session.bootstrap`,
      //    with the window's own start point restored first — the bootstrap runs in its own, fresh session, which
      //    never navigated there on its own. The search steps stay as ordinary crawl `steps`, after a `goto` back
      //    to where the recording continued once logged in.
      const folder = recipesFolder()
      const recipePath = join(folder, 'login.input.json')
      const bootstrapSteps = [{ type: 'goto', url: 'http://127.0.0.1:4599/login' }, fillUser, fillPass, clickSubmit]
      const crawlSteps = [
        { type: 'goto', url: 'http://127.0.0.1:4599/search' },
        waitQ, fillQ, pressEnter, waitNext, clickNext,
        { type: 'extract', id: 'heading', selector: 'h1', kind: 'css', take: 'text' },
        { type: 'emit' },
      ]
      const recipe = {
        kind:    'input',
        id:      'login',
        output:  'login',
        mode:    'web',
        start:   [{ url: 'http://127.0.0.1:4599/search' }],
        session: { bootstrap: { steps: bootstrapSteps, keep: ['cookies'], saveTo: 'storage/session.json' } },
        steps:   crawlSteps,
        mapping: { heading: { from: 'heading' } },
      }
      writeFileSync(recipePath, JSON.stringify(recipe, null, 2))

      // The recipe on disk never carries the real password either.
      expect(readFileSync(recipePath, 'utf8')).not.toContain(LOGIN_PASS)
      expect(readFileSync(recipePath, 'utf8')).toContain('{{env.PASS}}')
      expect((JSON.parse(readFileSync(recipePath, 'utf8')) as { session: { bootstrap: { keep: string[], saveTo: string } } }).session.bootstrap).toMatchObject({ keep: ['cookies'], saveTo: 'storage/session.json' })

      // 6. Running the recipe (with the env var set) actually logs in: the crawl reaches the results page
      //    (never bounced back to the login form), and the click's own navigation shows up in the trace as a
      //    page visit — `page:visit` already fires for a click's navigation (core's `follow-navigation.use-case.ts`).
      process.env.PASS = LOGIN_PASS
      try {
        const server = await startStudioServer({ uiRoot: emptyUiRoot(), browser: browserConfig() })
        try {
          await post(server, { type: 'open-workspace', folder })
          const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
          const traceLines: string[] = []
          const records: { heading: string }[] = []
          const finished = new Promise<{ emitted: number, error?: string }>((resolve) => {
            socket.addEventListener('message', (event) => {
              const message = JSON.parse(String(event.data)) as { type: string, line?: string, data?: { heading: string }, emitted?: number, error?: string }
              if (message.type === 'trace-line' && message.line !== undefined) traceLines.push(message.line)
              if (message.type === 'record' && message.data !== undefined) records.push(message.data)
              if (message.type === 'run-finished') resolve({ emitted: message.emitted ?? 0, error: message.error })
            })
          })
          await new Promise((resolve, reject) => {
            socket.addEventListener('open', resolve)
            socket.addEventListener('error', reject)
          })
          await post(server, { type: 'run-sample', recipeId: 'login' })
          const result = await finished
          socket.close()
          if (result.emitted !== 1) console.log('recording e2e: unexpected run result', result, '\ntrace:\n', traceLines.join('\n'))

          expect(result.error).toBeUndefined()
          expect(result.emitted).toBe(1)
          expect(records[0]?.heading).toBe('Results') // the login form has no <h1> at all — this proves the session carried the login through
          expect(traceLines.some(line => line.includes('⇢ page'))).toBe(true) // the bootstrap's own click navigation, reported like any other page:visit
        } finally {
          await server.close()
        }
      } finally {
        delete process.env.PASS
      }
    },
    60000,
  )
})
