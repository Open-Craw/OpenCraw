import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

/** RFC 6455's fixed handshake suffix. */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** One accepted WebSocket connection: text frames only, no compression, no fragmentation. */
export interface WsConnection {
  send:      (text: string) => void
  close:     () => void
  onMessage: (handler: (text: string) => void) => void
  onClose:   (handler: () => void) => void
}

/**
 * Accepts one WebSocket upgrade on the raw socket `node:http` hands an
 * `upgrade` listener, implementing just enough of RFC 6455 for the studio's
 * own one-directional event stream: the server sends small JSON text
 * frames, the client sends none (commands go over `POST /api/command`). No
 * `ws` dependency: this is deliberately small rather than general-purpose.
 *
 * @param request - The upgrade request (its `Sec-WebSocket-Key` header).
 * @param socket - The raw, already-connected socket.
 * @returns The connection: `send`, `close`, and where messages and the close go.
 */
export function acceptWebSocket (request: IncomingMessage, socket: Duplex): WsConnection {
  const key = request.headers['sec-websocket-key'] ?? ''
  const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  const messageHandlers: ((text: string) => void)[] = []
  const closeHandlers: (() => void)[] = []
  let buffer: Buffer = Buffer.alloc(0)
  socket.on('data', (chunk: Buffer) => {
    buffer = consumeFrames(Buffer.concat([buffer, chunk]), messageHandlers, closeHandlers, socket)
  })
  socket.on('close', () => { for (const handler of closeHandlers) handler() })
  socket.on('error', () => { for (const handler of closeHandlers) handler() })

  return {
    send:      text => { if (!socket.destroyed) socket.write(frame(text)) },
    close:     () => { socket.end(() => { socket.destroy() }) },
    onMessage: handler => { messageHandlers.push(handler) },
    onClose:   handler => { closeHandlers.push(handler) },
  }
}

/** One unmasked text frame (server-to-client frames are never masked). */
function frame (text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const { length } = payload
  const header = length < 126
    ? Buffer.from([0x81, length])
    : (length < 65536
        ? Buffer.concat([Buffer.from([0x81, 126]), lengthBytes(length, 2)])
        : Buffer.concat([Buffer.from([0x81, 127]), lengthBytes(length, 8)]))

  return Buffer.concat([header, payload])
}

function lengthBytes (value: number, size: 2 | 8): Buffer {
  const buffer = Buffer.alloc(size)
  if (size === 2) buffer.writeUInt16BE(value)
  else buffer.writeBigUInt64BE(BigInt(value))

  return buffer
}

/**
 * Reads every complete frame at the front of `buffer`, dispatching text and
 * close frames, and returns what is left (a partial frame still arriving).
 */
function consumeFrames (buffer: Buffer, messageHandlers: ((text: string) => void)[], closeHandlers: (() => void)[], socket: Duplex): Buffer {
  let rest = buffer
  for (;;) {
    if (rest.length < 2) return rest
    const opcode = rest[0] & 0x0F
    const masked = (rest[1] & 0x80) !== 0
    let length = rest[1] & 0x7F
    let offset = 2
    if (length === 126) {
      if (rest.length < offset + 2) return rest
      length = rest.readUInt16BE(offset)
      offset += 2
    } else if (length === 127) {
      if (rest.length < offset + 8) return rest
      length = Number(rest.readBigUInt64BE(offset))
      offset += 8
    }
    const maskLength = masked ? 4 : 0
    if (rest.length < offset + maskLength + length) return rest
    const mask = masked ? rest.subarray(offset, offset + 4) : undefined
    offset += maskLength
    const payload = Buffer.from(rest.subarray(offset, offset + length))
    if (mask !== undefined) for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
    offset += length
    if (opcode === 0x8) {
      for (const handler of closeHandlers) handler()
      socket.end()

      return Buffer.alloc(0)
    }
    // 0x1 text; ping/pong and continuation frames are ignored: every message here fits in one text frame.
    if (opcode === 0x1) for (const handler of messageHandlers) handler(payload.toString('utf8'))
    rest = rest.subarray(offset)
  }
}
