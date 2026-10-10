/** What to do with a navigation or a new-window request from the page. */
export type NavigationDecision = 'allow' | 'external' | 'deny'

/**
 * The window shows Studio and nothing else. A link to the web goes to the person's browser; anything
 * that is not a plain web address (`file:`, `javascript:`, a custom scheme) is refused.
 *
 * @param target - Where the page is going.
 * @param appOrigin - The origin the window was opened on (the local Studio server).
 * @returns `allow` for the app itself, `external` for a web page to open in the browser, `deny` otherwise.
 */
export function navigationDecision (target: string, appOrigin: string): NavigationDecision {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return 'deny'
  }
  if (url.origin === appOrigin) return 'allow'

  return url.protocol === 'https:' || url.protocol === 'http:' ? 'external' : 'deny'
}
