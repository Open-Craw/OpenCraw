import type { SampleRunHandle } from '../sample-run'
import type { StudioEvent } from '../studio-api'
import type { WsConnection } from './websocket.client'

/** The server's mutable state: the opened folder, the run in progress (if any), and the connected event sockets. */
export interface StudioState {
  folder?:    string
  activeRun?: SampleRunHandle
  sockets:    Set<WsConnection>
}

/** @returns Fresh state for a new server instance: no workspace open, no run, no sockets. */
export function createStudioState (): StudioState {
  return { sockets: new Set() }
}

/**
 * Sends one event to every connected client. A socket that errors while
 * sending (gone away without a clean close yet reaching us) is dropped
 * rather than left to fail every later broadcast too.
 *
 * @param state - The server state holding the connected sockets.
 * @param event - The event to send.
 */
export function broadcast (state: StudioState, event: StudioEvent): void {
  const text = JSON.stringify(event)
  for (const socket of state.sockets) {
    try {
      socket.send(text)
    } catch {
      state.sockets.delete(socket)
    }
  }
}
