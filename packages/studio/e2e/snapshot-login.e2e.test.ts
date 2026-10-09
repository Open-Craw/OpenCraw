import type { Server } from 'node:http'
import type { InputRecipe } from '@opencraw/core'
import { takeSnapshot } from '../src/page-snapshot'
import { FIXTURE_BASE, LOGIN_PASS, LOGIN_USER, browserConfig, startFixtureSite, stopFixtureSite } from './fixture-site'

const BOOTSTRAP = {
  keep:  ['cookies'],
  steps: [
    { type: 'goto', url: `${FIXTURE_BASE}/login` },
    { type: 'fill', selector: '#user', value: LOGIN_USER },
    { type: 'fill', selector: '#pass', value: LOGIN_PASS },
    { type: 'click', selector: '#submit' },
  ],
}

function recipe (session?: unknown): InputRecipe {
  return { kind: 'input', id: 'private', output: 'thing', mode: 'web', start: [{ url: `${FIXTURE_BASE}/search` }], session, steps: [], mapping: {} } as unknown as InputRecipe
}

describe('studio snapshot behind a login (issue #185)', () => {
  let site: Server
  beforeAll(async () => { site = await startFixtureSite() })
  afterAll(async () => { await stopFixtureSite(site) })

  it('shows the login wall when the recipe declares no login', async () => {
    const snapshot = await takeSnapshot(recipe(), 'start', browserConfig())
    expect(snapshot.html).toContain('loginForm')
  }, 60000)

  it('runs the recipe\'s session.bootstrap first, so the snapshot is the page the crawl reaches', async () => {
    const snapshot = await takeSnapshot(recipe({ bootstrap: BOOTSTRAP }), 'start', browserConfig())
    expect(snapshot.html).toContain('searchForm')
    expect(snapshot.html).not.toContain('loginForm')
  }, 60000)
})
