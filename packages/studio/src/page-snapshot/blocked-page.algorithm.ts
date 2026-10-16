/** What a bot-protection or access-denied page says about itself, in the words the common services use. */
const BLOCKED_PATTERNS: RegExp[] = [
  /performing security verification/i,
  /verify(?:ing)? (?:that )?you are (?:a )?human/i,
  /are you a robot/i,
  /checking your browser/i,
  /enable javascript and cookies to continue/i,
  /just a moment\.\.\./i,
  /attention required/i,
  /access denied/i,
  /request (?:was )?blocked/i,
  /unusual traffic/i,
  /pardon our interruption/i,
]

/**
 * Whether a page is the site's bot check or an access-denied page instead of its content, and, if so, what to tell the person: the
 * Studio's browser was turned away, so everything else on the screen is not the page they asked for.
 *
 * @param text - The page's title and the start of its visible text.
 * @param status - The HTTP status the page came with, when known.
 * @returns A sentence for the person, or `undefined` when the page looks like a page.
 */
export function blockedPageNotice (text: string, status?: number): string | undefined {
  const turnedAway = status === 403 || status === 429
  if (!turnedAway && BLOCKED_PATTERNS.every(pattern => !pattern.test(text))) return undefined
  if (turnedAway && text.trim().length > 4000) return undefined

  return 'This site is showing a security check or an access-denied page instead of its content: it has turned the Studio\'s browser away. Try again later, or look for the data the site itself offers (a download, a feed or an API).'
}
