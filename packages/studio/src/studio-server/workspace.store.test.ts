import { broadcast, createStudioState } from './workspace.store'
import type { WsConnection } from './websocket.client'

function fakeSocket (send: (text: string) => void): WsConnection {
  return { send, close: () => {}, onMessage: () => {}, onClose: () => {} }
}

describe('broadcast', () => {
  it('sends the event, JSON-encoded, to every connected socket', () => {
    const state = createStudioState()
    const received: string[] = []
    state.sockets.add(fakeSocket(text => { received.push(text) }))
    state.sockets.add(fakeSocket(text => { received.push(text) }))
    broadcast(state, { type: 'trace-line', line: 'hello' })
    expect(received).toEqual([JSON.stringify({ type: 'trace-line', line: 'hello' }), JSON.stringify({ type: 'trace-line', line: 'hello' })])
  })

  it('drops a socket whose send throws, without failing the broadcast', () => {
    const state = createStudioState()
    const broken = fakeSocket(() => { throw new Error('gone') })
    const received: string[] = []
    state.sockets.add(broken)
    state.sockets.add(fakeSocket(text => { received.push(text) }))
    expect(() => broadcast(state, { type: 'workspace-changed' })).not.toThrow()
    expect(received).toHaveLength(1)
    expect(state.sockets.has(broken)).toBe(false)
  })
})
