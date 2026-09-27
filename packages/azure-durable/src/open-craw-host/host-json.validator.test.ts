import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostJsonWarnings } from './host-json.validator'

function hostJson (durableTask: Record<string, unknown>): string {
  const directory = mkdtempSync(join(tmpdir(), 'opencraw-host-'))
  writeFileSync(join(directory, 'host.json'), JSON.stringify({ version: '2.0', extensions: { durableTask } }))

  return directory
}

describe('hostJsonWarnings', () => {
  it('warns when Durable runs fewer activities at once than a pool has windows', () => {
    expect(hostJsonWarnings(8, hostJson({ maxConcurrentActivityFunctions: 4 }))[0]).toContain('set it to at least 10')
    expect(hostJsonWarnings(8, hostJson({ maxConcurrentActivityFunctions: 16 }))).toEqual([])
    expect(hostJsonWarnings(8, hostJson({}))).toEqual([])
    const missing = join(tmpdir(), 'no-such-dir')
    expect(hostJsonWarnings(8, missing)).toEqual([])
  })
})
