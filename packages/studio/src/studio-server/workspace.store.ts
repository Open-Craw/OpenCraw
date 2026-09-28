import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserSessionConfig } from '@opencraw/core'
import type { RecorderSessionHandle } from '../flow-recording'
import { createSnapshotCache } from '../page-snapshot'
import type { SnapshotCache } from '../page-snapshot'
import { createLastRunCache } from '../sample-run'
import type { LastRunCache, SampleRunHandle } from '../sample-run'
import type { StudioEvent } from '../studio-api'
import type { WsConnection } from './websocket.client'

/** Where the studio's own recorder profile lives when `StudioServerOptions.recorderProfileDir` is not given: never a crawl's own `session.browserProfile` directory, never the person's default browser profile. */
function defaultRecorderProfileDir (): string {
  return join(tmpdir(), 'opencraw-studio', 'recorder-profile')
}

/** The server's mutable state: the opened folder, the run in progress (if any), the recording in progress (if any, issue #95), the connected event sockets, the per-recipe snapshot cache `take-snapshot`/`verify-selector`/`infer-selector` share, each recipe's last finished sample run (`explain-why`, issue #92), the browser launch settings every web-mode command (`take-snapshot`, `verify-selector`, `run-sample`, `start-recording`) shares, and where the studio's own recorder profile lives. */
export interface StudioState {
  folder?:            string
  activeRun?:         SampleRunHandle
  activeRecording?:   RecorderSessionHandle
  sockets:            Set<WsConnection>
  snapshots:          SnapshotCache
  lastRuns:           LastRunCache
  /** Set once at server start (`StudioServerOptions.browser`); every web-mode command reads it from here rather than each accepting its own. */
  browser?:           BrowserSessionConfig
  /** Set once at server start (`StudioServerOptions.recorderProfileDir`), else `defaultRecorderProfileDir()`. */
  recorderProfileDir: string
}

/** @returns Fresh state for a new server instance: no workspace open, no run, no recording, no sockets, an empty snapshot cache, no last runs, Playwright's own default browser, the default recorder profile directory. */
export function createStudioState (): StudioState {
  return { sockets: new Set(), snapshots: createSnapshotCache(), lastRuns: createLastRunCache(), recorderProfileDir: defaultRecorderProfileDir() }
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
