import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StudioEvent } from '../studio-api'
import { handleRunSample, handleStopRun } from './run-sample.handler'
import { createStudioState } from './workspace.store'
import type { WsConnection } from './websocket.client'

function workspace (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-run-handler-'))
  writeFileSync(join(folder, 'item.output.json'), JSON.stringify({ kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string', required: true, key: true } } }))
  const dataFile = join(folder, 'data.json')
  writeFileSync(dataFile, JSON.stringify({ items: [{ name: 'a1' }, { name: 'a2' }] }))
  writeFileSync(join(folder, 'items.input.json'), JSON.stringify({
    kind:   'input',
    id:     'items',
    output: 'item',
    mode:   'api',
    start:  [{ url: `file://${dataFile}` }],
    steps:  [
      { type: 'request', id: 'list', url: '{{start.url}}', as: 'json' },
      { type: 'extract', id: 'entries', from: 'list', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
      { type: 'forEach', over: 'entries', as: 'item', emit: true, steps: [] },
    ],
    mapping: { name: { from: 'item.name' } },
  }))

  return folder
}

function listening (): { events: StudioEvent[], socket: WsConnection } {
  const events: StudioEvent[] = []

  return { events, socket: { send: text => { events.push(JSON.parse(text) as StudioEvent) }, close: () => {}, onMessage: () => {}, onClose: () => {} } }
}

describe('handleRunSample', () => {
  it('rejects when no workspace is open', async () => {
    await expect(handleRunSample(createStudioState(), { type: 'run-sample', recipeId: 'items' })).rejects.toThrow('open a workspace first')
  })

  it('streams trace lines and records, then broadcasts run-finished', async () => {
    const state = createStudioState()
    state.folder = workspace()
    const { events, socket } = listening()
    state.sockets.add(socket)

    const response = await handleRunSample(state, { type: 'run-sample', recipeId: 'items' })
    expect(response).toEqual({ started: true })
    await state.activeRun?.result

    expect(events.some(event => event.type === 'trace-line')).toBe(true)
    expect(events.filter(event => event.type === 'record')).toHaveLength(2)
    const finished = events.find(event => event.type === 'run-finished')
    expect(finished).toMatchObject({ emitted: 2, recipeId: 'items' })
  })
})

describe('handleStopRun', () => {
  it('reports nothing to stop when no run is active', async () => {
    await expect(handleStopRun(createStudioState(), { type: 'stop-run' })).resolves.toEqual({ stopped: false })
  })

  it('stops the active run', async () => {
    const state = createStudioState()
    state.folder = workspace()
    await handleRunSample(state, { type: 'run-sample', recipeId: 'items' })
    await expect(handleStopRun(state, { type: 'stop-run' })).resolves.toEqual({ stopped: true })
  })
})
