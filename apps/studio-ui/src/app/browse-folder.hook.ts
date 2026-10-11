import { useState } from 'react'
import { useStudioClient } from '../studio-client'
import { useStudioUiStore } from '../studio-store'

export interface BrowseFolderFlow {
  /** Opens the server's folder dialog; once a folder is picked it becomes the open workspace, as if it had been typed and confirmed. */
  browse:  () => Promise<void>
  pending: boolean
  /** Why no dialog opened (no display, no dialog program installed); the folder box keeps working. */
  error?:  string
}

/**
 * "Browse…": a browser cannot open the folder picker, so the server does it
 * on the machine it runs on, which is where the folder is. The answer goes
 * through the same `commitFolder` the Open button uses.
 */
export function useBrowseFolderFlow (): BrowseFolderFlow {
  const client = useStudioClient()
  const commitFolder = useStudioUiStore(state => state.commitFolder)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  async function browse (): Promise<void> {
    setError(undefined)
    setPending(true)
    try {
      const folder = await client.chooseFolder()
      if (folder !== undefined) commitFolder(folder)
    } catch (browseError) {
      setError(browseError instanceof Error ? browseError.message : String(browseError))
    } finally {
      setPending(false)
    }
  }

  return { browse, pending, error }
}
