/** Recognises Playwright's own "no browser downloaded" failure so a launch can be retried after installing one, instead of surfacing Playwright's raw ASCII-art error. */
export function isMissingBrowserError (error: unknown): boolean {
  return error instanceof Error && /Executable doesn't exist at/.test(error.message)
}
