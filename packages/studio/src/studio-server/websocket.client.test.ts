import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { acceptWebSocket } from './websocket.client'
import type { WsConnection } from './websocket.client'

function listen (server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address !== null ? address.port : 0)
    })
  })
}

function closeServer (server: Server): Promise<void> {
  server.closeAllConnections()

  return new Promise((resolve) => { server.close(() => resolve()) })
}

describe('acceptWebSocket', () => {
  let server: Server
  let connections: WsConnection[]

  beforeEach(() => {
    connections = []
    server = createServer((_request, response) => {
      response.writeHead(404)
      response.end()
    })
    server.on('upgrade', (request, socket) => { connections.push(acceptWebSocket(request, socket)) })
  })

  afterEach(async () => { await closeServer(server) })

  it('sends text frames a real WebSocket client can read', async () => {
    const port = await listen(server)
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    await new Promise((resolve, reject) => {
      client.addEventListener('open', resolve)
      client.addEventListener('error', reject)
    })
    const received = new Promise<string>((resolve) => { client.addEventListener('message', (event) => resolve(String(event.data))) })
    connections[0].send('{"type":"trace-line","line":"hello"}')
    await expect(received).resolves.toBe('{"type":"trace-line","line":"hello"}')
    client.close()
  })

  it('notifies onClose when the client disconnects', async () => {
    const port = await listen(server)
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    await new Promise((resolve, reject) => {
      client.addEventListener('open', resolve)
      client.addEventListener('error', reject)
    })
    const closed = new Promise<void>((resolve) => { connections[0].onClose(() => resolve()) })
    client.close()
    await closed
  })

  it('does not throw sending to an already-closed connection', async () => {
    const port = await listen(server)
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    await new Promise((resolve, reject) => {
      client.addEventListener('open', resolve)
      client.addEventListener('error', reject)
    })
    connections[0].close()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(() => connections[0].send('after close')).not.toThrow()
  })
})
