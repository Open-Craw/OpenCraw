import { startStudioProcess } from './studio-process.client'
import type { HostChild } from './studio-process.client'
import type { HostReply, HostRequest } from './studio-host.contract'

interface FakeChild {
  child:  HostChild
  sent:   HostRequest[]
  reply:  (message: HostReply) => void
  exit:   (code: number | null) => void
  print:  (text: string) => void
  killed: () => boolean
}

/** A child the test drives by hand: what the client sent, and replies and exits on demand. */
function fakeChild (): FakeChild {
  const listeners = new Map<string, ((value: unknown) => void)[]>()
  const on = (event: string, listener: (value: unknown) => void): void => {
    listeners.set(event, [...listeners.get(event) ?? [], listener])
  }
  const emit = (event: string, value: unknown): void => {
    const registered = listeners.get(event) ?? []
    for (const listener of registered) listener(value)
  }
  const sent: HostRequest[] = []
  let wasKilled = false
  const child = {
    send:   (message: HostRequest) => { sent.push(message) },
    kill:   () => { wasKilled = true },
    on,
    stderr: { on: (event: string, listener: (value: unknown) => void) => { on(`stderr-${event}`, listener) } },
  } as unknown as HostChild

  return {
    child,
    sent,
    reply:  message => { emit('message', message) },
    exit:   code => { emit('exit', code) },
    print:  text => { emit('stderr-data', text) },
    killed: () => wasKilled,
  }
}

describe('startStudioProcess', () => {
  it('starts the script with the workspace and resolves once the server is ready', async () => {
    const fake = fakeChild()
    const started: (string | undefined)[] = []
    const pending = startStudioProcess({
      script:    '/ext/studio-host.process.mjs',
      workspace: '/work',
      spawn:     (script, workspace) => {
        started.push(script, workspace)

        return fake.child
      },
    })
    fake.reply({ type: 'ready', url: 'http://127.0.0.1:1/?token=t' })

    await pending

    expect(started).toEqual(['/ext/studio-host.process.mjs', '/work'])
  })

  it('asks the process for a link and answers with its reply', async () => {
    const fake = fakeChild()
    const pending = startStudioProcess({ script: 's', spawn: () => fake.child })
    fake.reply({ type: 'ready', url: 'u' })
    const studio = await pending

    const link = studio.link({ open: '/work/a.pdf', workspace: '/work' })
    expect(fake.sent).toEqual([{ type: 'link', id: 1, target: { open: '/work/a.pdf', workspace: '/work' } }])
    fake.reply({ type: 'link', id: 1, url: 'http://127.0.0.1:1/?token=t&open=%2Fwork%2Fa.pdf' })

    expect(await link).toBe('http://127.0.0.1:1/?token=t&open=%2Fwork%2Fa.pdf')
  })

  it('answers each overlapping link request with its own reply', async () => {
    const fake = fakeChild()
    const pending = startStudioProcess({ script: 's', spawn: () => fake.child })
    fake.reply({ type: 'ready', url: 'u' })
    const studio = await pending

    const first = studio.link({ open: '/a' })
    const second = studio.link({ open: '/b' })
    fake.reply({ type: 'link', id: 2, url: 'second' })
    fake.reply({ type: 'link', id: 1, url: 'first' })

    expect([await first, await second]).toEqual(['first', 'second'])
  })

  it('fails the start with what the process printed when it ends first', async () => {
    const fake = fakeChild()
    const pending = startStudioProcess({ script: 's', spawn: () => fake.child })
    fake.print('Cannot find package @opencraw/studio\n')
    fake.exit(1)

    await expect(pending).rejects.toThrow('exit 1) before it was ready: Cannot find package @opencraw/studio')
  })

  it('fails the start with the message the process reported', async () => {
    const fake = fakeChild()
    const pending = startStudioProcess({ script: 's', spawn: () => fake.child })
    fake.reply({ type: 'failed', message: 'EADDRINUSE' })

    await expect(pending).rejects.toThrow('EADDRINUSE')
  })

  it('rejects a pending link and later ones once the process has ended, and says so through ended', async () => {
    const fake = fakeChild()
    const pending = startStudioProcess({ script: 's', spawn: () => fake.child })
    fake.reply({ type: 'ready', url: 'u' })
    const studio = await pending
    const waiting = studio.link()

    fake.exit(0)

    await expect(waiting).rejects.toThrow('ended')
    await expect(studio.link()).rejects.toThrow('has ended')
    await expect(studio.ended).resolves.toBeUndefined()
  })

  it('kills the process on dispose', async () => {
    const fake = fakeChild()
    const pending = startStudioProcess({ script: 's', spawn: () => fake.child })
    fake.reply({ type: 'ready', url: 'u' })
    const studio = await pending

    studio.dispose()

    expect(fake.killed()).toBe(true)
  })
})
