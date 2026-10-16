/** The start of a browser's technical call log, which says nothing a person can use. */
const CALL_LOG = /\s*Call log:[\s\S]*$/
/** Terminal colour codes the browser's own errors are written with: shown as boxes in a page. */
// eslint-disable-next-line no-control-regex -- the escape character is what is being removed
const COLOUR_CODES = /\u{1B}\[[\d;]*m|\[\d{1,2}m/gu

/** What went wrong, in the words a person would use, for the few failures people meet all the time; the first to match wins. */
const PLAIN: [RegExp, string][] = [
  [/Download is starting/i, 'This address is a file to download, not a web page. Load it again from Load ▾ → Web page: files are opened as documents.'],
  [/ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo/i, 'The address could not be found. Check that it is spelled correctly.'],
  [/ERR_CONNECTION_REFUSED|ECONNREFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ECONNRESET/i, 'The site refused the connection. It may be down, or may not allow this kind of visit.'],
  [/ERR_CERT|certificate|SSL/i, "The site's security certificate is not valid, so the browser would not open it."],
  [/Timeout \d+ms exceeded|ERR_TIMED_OUT|timed out|ETIMEDOUT/i, 'The site took too long to answer. Try again in a moment, and check your connection.'],
  [/\bstatus\D{1,15}40[13]\b|\bHTTP\W*40[13]\b|\b40[13] (?:Forbidden|Unauthorized)/i, 'The site refused to show this page (access denied).'],
  [/\bstatus\D{1,15}404\b|\bHTTP\W*404\b|\b404 Not Found/i, 'The page was not found (404). Check the address.'],
  [/\bstatus\D{1,15}429\b|\bHTTP\W*429\b|Too Many Requests/i, 'The site says it was asked too often. Wait a while and try again.'],
  [/\bstatus\D{1,15}5\d\d\b|\bHTTP\W*5\d\d\b/i, 'The site had a problem answering (a server error). Try again later.'],
]

/**
 * A server's or browser's error as a message for a person: without terminal colour codes or the technical "Call log", and, for the failures
 * people meet all the time (an address that does not exist, a refused or slow site, a download where a page was expected), in plain words.
 * What is not recognised is kept, cleaned, so no information is lost.
 *
 * @param message - The error text as it arrived.
 * @returns The message to show.
 */
export function plainError (message: string): string {
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2021 String#replaceAll).
  const cleaned = message.replace(COLOUR_CODES, '').replace(CALL_LOG, '').replace(/\s+/g, ' ').trim()
  const plain = PLAIN.find(([pattern]) => pattern.test(message))

  return plain === undefined ? cleaned : plain[1]
}
