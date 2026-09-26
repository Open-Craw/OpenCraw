/**
 * What a worker window remembers of the kept top-level steps it ran: each
 * step's rendered form, by its position. A step holding the same form is
 * skipped on the next item; one that runs again (a new value) makes the
 * window forget every kept step after it, since a change cascades (a new
 * state reloads the list of RTOs, so the RTO pick must run again).
 *
 * Like a waiter who leaves the cutlery on the table between two guests, but
 * relays the table from the first thing that changes.
 */
export class StepMemory {
  private readonly kept = new Map<number, string>()

  /** How many steps it holds. */
  get size (): number {
    return this.kept.size
  }

  /**
   * @param index - The step's position in the top-level list.
   * @param form - The step as it would run now, rendered.
   * @returns Whether the window already holds what the step would do.
   */
  holds (index: number, form: string): boolean {
    return this.kept.get(index) === form
  }

  /**
   * Records a kept step that ran, and forgets the kept steps after it.
   *
   * @param index - The step's position in the top-level list.
   * @param form - The step as it ran, rendered.
   */
  remember (index: number, form: string): void {
    for (const later of this.kept.keys()) {
      if (later > index) this.kept.delete(later)
    }
    this.kept.set(index, form)
  }

  /** Forgets everything: the page is not what the window thought. */
  forget (): void {
    this.kept.clear()
  }
}
