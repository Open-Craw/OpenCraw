import { useEffect, useState } from 'react'
import { useStudioClient } from '../studio-client'
import { useOpenTarget } from './open-path.hook'

/**
 * Does what a controller asked this page to do (an agent, through the MCP server, so the person watching sees it happen):
 * today, to open a folder, a recipe or a document the way a Studio link does. Call once, near the app's root.
 *
 * @returns The error to show when a request could not be done.
 */
export function useUiRequests (): string | undefined {
  const client = useStudioClient()
  const openTarget = useOpenTarget()
  const [error, setError] = useState<string>()

  useEffect(() => client.subscribe((event) => {
    if (event.type !== 'ui-request') return
    setError(undefined)
    void openTarget(event.request.path, event.request.workspace).catch((openError: unknown) => {
      setError(openError instanceof Error ? openError.message : String(openError))
    })
  }), [client, openTarget])

  return error
}
