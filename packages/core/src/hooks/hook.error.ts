/** A recipe named a hook nothing registered. */
export class UnknownHookError extends Error {
  override readonly name = 'UnknownHookError'

  /**
   * @param hookName - The name the recipe used.
   * @param known - The names registered.
   * @param where - Where the recipe uses it (`books steps.2`), when known.
   */
  constructor (readonly hookName: string, known: readonly string[], readonly where?: string) {
    super(`${where === undefined ? '' : `${where}: `}unknown hook "${hookName}"${known.length === 0 ? ' (no hooks registered)' : `; registered: ${known.join(', ')}`}`)
  }
}
