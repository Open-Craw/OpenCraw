// Runs Studio's server for the extension, in a process of its own: Playwright and the engine stay out
// of the editor's extension host, and a crash or a stuck browser cannot take the editor with it.
// The extension forks this file and talks to it over the IPC channel (`studio-host.contract.ts`).
// It lives as long as the channel: when the extension host goes away, the server is closed and the
// process ends with nothing left to keep it alive.
import { startStudioServer } from '@opencraw/studio'

/** Reads a hooks or plugins module as the command line does with --hooks: on the person own authority. */
async function loadHooksFile (file) {
  const { loadPlugins } = await import('@opencraw/cli')

  return { source: file, ...await loadPlugins(file) }
}

try {
  const { workspace, hooks } = JSON.parse(process.argv[2] ?? '{}')
  // The hooks file runs as the person's own code, named in their user settings (never a workspace's).
  const plugins = hooks === undefined ? undefined : await loadHooksFile(hooks)
  const server = await startStudioServer({ initialFolder: workspace, plugins })
  process.send({ type: 'ready', url: server.url })
  process.on('message', message => {
    if (message?.type === 'link') process.send({ type: 'link', id: message.id, url: server.link(message.target) })
  })
  process.on('disconnect', () => {
    void server.close()
  })
} catch (error) {
  process.exitCode = 1
  process.send({ type: 'failed', message: error instanceof Error ? error.message : String(error) })
  process.disconnect()
}
