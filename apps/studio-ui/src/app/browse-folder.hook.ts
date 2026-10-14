import { useState } from 'react'
import { useStudioClient } from '../studio-client'
import { useStudioUiStore } from '../studio-store'

/** How a browse ended: a folder was opened, the dialog was closed without one, or there is no dialog (the caller offers the folder box). */
export type BrowseOutcome = 'picked' | 'cancelled' | 'unavailable'

export interface BrowseFolderFlow {
  /** Opens the server's folder dialog; once a folder is picked it becomes the open workspace, as if it had been typed and confirmed. */
  browse:  () => Promise<BrowseOutcome>
  pending: boolean
  /** Why no dialog opened (no display, no dialog program installed); the folder box keeps working. */
  error?:  string
}

/**
 * "Open folder…": a browser cannot open the folder picker, so the server does it
 * on the machine it runs on, which is where the folder is: the operating
 * system's dialog, or the editor's own when Studio runs in the VS Code
 * extension. The answer goes through the same `commitFolder` the Open button uses.
 */
export function useBrowseFolderFlow (): BrowseFolderFlow {
  const client = useStudioClient()
  const commitFolder = useStudioUiStore(state => state.commitFolder)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  async function browse (): Promise<BrowseOutcome> {
    setError(undefined)
    setPending(true)
    try {
      const folder = await client.chooseFolder()
      if (folder === undefined) return 'cancelled'
      commitFolder(folder)

      return 'picked'
    } catch (browseError) {
      setError(browseError instanceof Error ? browseError.message : String(browseError))

      return 'unavailable'
    } finally {
      setPending(false)
    }
  }

  return { browse, pending, error }
}
