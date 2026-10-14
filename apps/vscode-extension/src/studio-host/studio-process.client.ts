import { fork } from 'node:child_process'
import type { HostConfig, HostReply, HostRequest, LinkTarget } from './studio-host.contract'

/** The part of a child process the client uses; `fork`'s result satisfies it, a test passes a fake. */
export interface HostChild {
  send:    (message: HostRequest) => unknown
  kill:    () => unknown
  on:      ((event: 'message', listener: (message: HostReply) => void) => unknown) & ((event: 'exit', listener: (code: number | null) => void) => unknown)
  stderr?: { on: (event: 'data', listener: (chunk: Uint8Array | string) => void) => unknown } | null
}

/** Starts the Studio process: the script to run and what it starts with. */
export type SpawnHost = (script: string, config: HostConfig) => HostChild

/** Shows the editor's folder dialog and resolves to the folder picked, or `undefined` when it was closed without a choice. */
export type ChooseFolder = () => Promise<string | undefined>

export interface StudioProcess {
  /** The link that opens `target` in the browser (`/?token=…&open=…`). Rejects when the process has ended. */
  link:    (target?: LinkTarget) => Promise<string>
  /** Stops the server and its process. */
  dispose: () => void
  /** Settles when the process has ended, for any reason: the caller starts a new one on the next use. */
  ended:   Promise<void>
}

/**
 * Forks the editor's own executable as plain Node (`ELECTRON_RUN_AS_NODE`: an
 * editor built on Electron has no other Node to offer), with an IPC channel
 * and the error output piped back so a failed start can say why.
 */
export const forkHost: SpawnHost = (script, config) => fork(script, [JSON.stringify(config)], {
  env:   { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
})

/** How much of the process's error output is kept for the message of a failed start. */
const STDERR_KEPT = 2000

/** Asks the editor's dialog (when it has one) and sends the process what it chose; a dialog that fails answers like one that was closed. */
async function answerFolder (child: HostChild, id: number, chooseFolder: ChooseFolder | undefined): Promise<void> {
  let folder: string | undefined
  try {
    folder = await chooseFolder?.()
  } catch {
    folder = undefined
  }
  child.send({ type: 'folder', id, folder })
}

interface PendingLink {
  resolve: (url: string) => void
  reject:  (error: Error) => void
}

/**
 * Starts Studio's server in its own process and waits until it is serving.
 *
 * @param options.script - The `studio-host.process.mjs` to run.
 * @param options.workspace - The folder Studio opens first, typically the editor's workspace folder.
 * @param options.hooks - A hooks or plugins module to run recipes with (the `opencraw.hooksFile` setting).
 * @param options.chooseFolder - The editor's folder dialog, which Studio's Open folder… uses; without it the process answers that there is none.
 * @param options.spawn - How the process is started; `forkHost` by default.
 * @returns The running process.
 * @throws Error when the process ends or reports a failure before it is serving; the message carries what it printed.
 */
export async function startStudioProcess (options: { script: string, workspace?: string, hooks?: string, chooseFolder?: ChooseFolder, spawn?: SpawnHost }): Promise<StudioProcess> {
  const child = (options.spawn ?? forkHost)(options.script, { workspace: options.workspace, hooks: options.hooks })
  let printed = ''
  child.stderr?.on('data', chunk => { printed = (printed + String(chunk)).slice(-STDERR_KEPT) })

  const waiting = new Map<number, PendingLink>()
  let lastId = 0
  let serving = false
  let finished = false

  const ready = new Promise<void>((resolve, reject) => {
    child.on('message', message => {
      switch (message.type) {
        case 'ready': {
          serving = true
          resolve()
          break
        }
        case 'link': {
          waiting.get(message.id)?.resolve(message.url)
          waiting.delete(message.id)
          break
        }
        case 'choose-folder': {
          void answerFolder(child, message.id, options.chooseFolder)
          break
        }
        case 'failed': {
          if (!serving) reject(new Error(message.message))
          break
        }
      }
    })
    child.on('exit', code => {
      finished = true
      for (const request of waiting.values()) request.reject(new Error('the OpenCraw Studio process ended'))
      waiting.clear()
      if (!serving) reject(new Error(`the OpenCraw Studio process ended (exit ${code ?? 'unknown'}) before it was ready${printed.trim() === '' ? '' : `: ${printed.trim()}`}`))
    })
  })
  const ended = new Promise<void>(resolve => {
    child.on('exit', () => { resolve() })
  })

  await ready

  return {
    link: async target => await new Promise<string>((resolve, reject) => {
      if (finished) {
        reject(new Error('the OpenCraw Studio process has ended'))

        return
      }
      lastId += 1
      waiting.set(lastId, { resolve, reject })
      child.send({ type: 'link', id: lastId, target })
    }),
    dispose: () => { child.kill() },
    ended,
  }
}
