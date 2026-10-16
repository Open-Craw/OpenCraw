import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'

/** The zoom levels, 1 = as drawn: each step is about a fifth more or less. */
export const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3] as const

export interface Zoom {
  zoom:    number
  zoomIn:  () => void
  zoomOut: () => void
  reset:   () => void
}

function stepFrom (zoom: number, direction: 1 | -1): number {
  const index = ZOOM_STEPS.findIndex(step => step >= zoom)
  const here = index === -1 ? ZOOM_STEPS.length - 1 : index
  const next = Math.min(Math.max(here + direction, 0), ZOOM_STEPS.length - 1)

  return ZOOM_STEPS[next] ?? 1
}

/** The content pane's zoom, and ctrl + wheel over `target` zooms it too (the page does not zoom with it). */
export function useZoom (target: RefObject<HTMLElement | null>): Zoom {
  const [zoom, setZoom] = useState(1)
  const zoomIn = useCallback(() => { setZoom(current => stepFrom(current, 1)) }, [])
  const zoomOut = useCallback(() => { setZoom(current => stepFrom(current, -1)) }, [])
  const reset = useCallback(() => { setZoom(1) }, [])

  useEffect(() => {
    const element = target.current
    if (element === null) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      if (event.deltaY < 0) zoomIn()
      else zoomOut()
    }
    element.addEventListener('wheel', onWheel, { passive: false })

    return () => { element.removeEventListener('wheel', onWheel) }
  }, [target, zoomIn, zoomOut])

  return { zoom, zoomIn, zoomOut, reset }
}
