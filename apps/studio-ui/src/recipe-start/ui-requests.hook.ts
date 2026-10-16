import { useEffect, useState } from 'react'
import { useStudioClient } from '../studio-client'
import { useStudioUiStore, useUiRequestStore } from '../studio-store'
import { useOpenTarget } from './open-path.hook'

function messageOf (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Does what a controller asked this page to do (an agent, through the MCP server, so the person watching sees it happen)
 * and tells the server how it went, so the controller can find out: open a folder, a recipe or a document the way a Studio
 * link does, or pick a value on a recipe's web page (the recipe is selected here; the content pane does the pick once
 * its snapshot is there, and reports). Call once, near the app's root.
 *
 * @returns The error to show when a request could not be done.
 */
export function useUiRequests (): string | undefined {
  const client = useStudioClient()
  const openTarget = useOpenTarget()
  const selectRecipe = useStudioUiStore(state => state.selectRecipe)
  const askPick = useUiRequestStore(state => state.askPick)
  const [error, setError] = useState<string>()

  useEffect(() => client.subscribe((event) => {
    if (event.type !== 'ui-request') return
    const { requestId, request } = event
    setError(undefined)
    if (request.kind === 'pick') {
      selectRecipe(request.recipeId)
      askPick({ requestId, recipeId: request.recipeId, selector: request.selector, text: request.text, add: request.add })

      return
    }
    void (async () => {
      let ok = true
      let message = `Opened ${request.path}.`
      try {
        await openTarget(request.path, request.workspace)
      } catch (openError) {
        ok = false
        message = messageOf(openError)
        setError(message)
      }
      try {
        await client.reportUiOutcome(requestId, ok, message)
      } catch {
        // A controller that never hears back just times out.
      }
    })()
  }), [client, openTarget, selectRecipe, askPick])

  return error
}
