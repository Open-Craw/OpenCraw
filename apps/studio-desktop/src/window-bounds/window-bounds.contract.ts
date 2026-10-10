/** Where the window sat when the person last closed it, in screen coordinates. */
export interface WindowBounds {
  readonly x:         number
  readonly y:         number
  readonly width:     number
  readonly height:    number
  readonly maximized: boolean
}

/** A screen's usable area (the part not taken by the task bar or the menu bar). */
export interface WorkArea {
  readonly x:      number
  readonly y:      number
  readonly width:  number
  readonly height: number
}
