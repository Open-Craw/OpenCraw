import type { ObservedResponseView } from '@opencraw/studio'

/** The recipe patch one "responses seen" pick writes: `mode`, `start` and `steps` — the three fields switching to api mode on one endpoint touches. Every other key (`id`, `output`, `mapping`, `vars`…) is left as the recipe already had it. */
export interface ApiModeSwitch {
  mode:  'api'
  start: [{ url: string }]
  steps: [{ type: 'request', id: string, url: string, as: 'json' }]
}

const REQUEST_STEP_ID = 'response'

/**
 * Switches a recipe to api mode on one JSON response (studio plan §3.3,
 * issue #93): `start` becomes that response's own URL, and `steps` becomes
 * one `request` step reading it as JSON (`{{start.url}}`, the same
 * convention every hand-written api recipe in this repo uses). A query
 * value that exactly matches one of the recipe's `vars` is templated,
 * `{{vars.<name>}}`, instead of hard-coded — the same reach a person
 * editing the JSON by hand would give it.
 *
 * What comes after (the phase 5a JSON tree canvas, for picking fields out of
 * the fetched shape) is not built here — this function's whole job is
 * getting the mode switch and the `request` step right; see this phase's
 * final report.
 *
 * @param response - The picked response.
 * @param vars - The recipe's own `vars`, if it has any (values are matched by `String(value)`).
 * @returns The patch to merge into the recipe (`mode`/`start`/`steps` only).
 */
export function apiModeFromResponse (response: ObservedResponseView, vars: Record<string, unknown> | undefined): ApiModeSwitch {
  return {
    mode:  'api',
    start: [{ url: templatedUrl(response.url, vars) }],
    steps: [{ type: 'request', id: REQUEST_STEP_ID, url: '{{start.url}}', as: 'json' }],
  }
}

/**
 * Rewrites a URL's query values that match a `vars` entry to `{{vars.<name>}}`,
 * built by hand rather than through `URLSearchParams#toString` — that would
 * percent-encode the placeholder's own braces, corrupting it.
 */
function templatedUrl (rawUrl: string, vars: Record<string, unknown> | undefined): string {
  const url = new URL(rawUrl)
  const nameByValue = new Map(Object.entries(vars ?? {}).map(([name, value]) => [String(value), name]))
  const params = [...url.searchParams].map(([key, value]) => {
    const varName = nameByValue.get(value)

    return `${key}=${varName === undefined ? encodeURIComponent(value) : `{{vars.${varName}}}`}`
  })

  return `${url.origin}${url.pathname}${params.length === 0 ? '' : `?${params.join('&')}`}`
}
