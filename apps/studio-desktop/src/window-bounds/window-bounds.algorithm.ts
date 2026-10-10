import type { WindowBounds, WorkArea } from './window-bounds.contract'

/** How much of the window must still be on a screen for it to be worth restoring: enough to grab. */
const MIN_VISIBLE = 120

function overlap (bounds: WindowBounds, area: WorkArea): { width: number, height: number } {
  return {
    width:  Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x),
    height: Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y),
  }
}

/**
 * @param saved - The bounds kept from the last run.
 * @param areas - The screens that are connected now.
 * @returns `saved` when enough of the window would still be on a screen, otherwise `undefined` so the
 *   window opens at its default place (a monitor that was unplugged must not strand the window).
 */
export function visibleBounds (saved: WindowBounds | undefined, areas: readonly WorkArea[]): WindowBounds | undefined {
  if (saved === undefined) return undefined
  const reachable = areas.some(area => {
    const shared = overlap(saved, area)

    return shared.width >= MIN_VISIBLE && shared.height >= MIN_VISIBLE
  })

  return reachable ? saved : undefined
}
