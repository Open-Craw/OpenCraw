import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { announceInstance, withdrawInstance } from './instance-file.repository'

describe('announceInstance', () => {
  let directory: string
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'oc-instance-')) })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  it('writes one file per process with the address and the token, and withdraws it', async () => {
    const instance = { pid: 4242, url: 'http://127.0.0.1:5555', token: 'secret', folder: '/work', startedAt: '2026-10-16T10:00:00.000Z' }
    expect(await announceInstance(instance, join(directory, 'nested'))).toBe(true)
    const written = await readFile(join(directory, 'nested', '4242-5555.json'), 'utf8')
    expect(JSON.parse(written)).toEqual(instance)
    await withdrawInstance(instance, join(directory, 'nested'))
    await expect(readFile(join(directory, 'nested', '4242-5555.json'), 'utf8')).rejects.toThrow()
  })

  it('answers false, not an error, when the directory cannot be written', async () => {
    const unwritable = join(directory, 'a\0b')
    expect(await announceInstance({ pid: 1, url: 'http://127.0.0.1:1', token: 't', startedAt: 'now' }, unwritable)).toBe(false)
  })
})
