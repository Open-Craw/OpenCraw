import { useMemo } from 'react'
import { createStudioClient } from './studio-client'
import type { StudioClient } from './studio-client'

/** The studio client, created once per page load. */
export function useStudioClient (): StudioClient {
  return useMemo(() => createStudioClient(), [])
}
