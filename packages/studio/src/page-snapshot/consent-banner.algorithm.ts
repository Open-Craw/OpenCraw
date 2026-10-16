/**
 * A script that, in a page, finds a cookie or consent banner's button and presses it: "Reject all", "Only necessary cookies" and the
 * like first, else "Accept all", "I agree"... A banner that is left in place covers the page in the Studio's view of it, and the
 * Studio's own clicks (to pick a value) would land on the banner. Only buttons whose whole text is one of these are pressed, so a
 * "Cookie settings" button, a link to a policy and the page's own buttons are left alone. The answer is the text of the button
 * pressed, or an empty string when there was none.
 *
 * It only ever runs in the browser the Studio captures the page with, never in a crawl.
 */
export const DISMISS_CONSENT_SCRIPT = String.raw`(() => {
  const reject = /^(reject all( cookies)?|reject|decline all|decline|deny( all)?|refuse( all)?|only (necessary|essential)( cookies)?|necessary( cookies)? only|essential( cookies)? only|use necessary cookies only|continue without accepting|no,? thanks)$/i
  const accept = /^(accept all( cookies)?|accept( cookies)?|allow all( cookies)?|allow cookies|i agree|agree|yes,? i agree|yes,? these cookies are ok|i accept|ok|okay|got it)$/i
  const visible = (element) => {
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)

    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
  }
  const label = (element) => (element.innerText || element.value || element.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')
  const candidates = [...document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')].filter(visible)
  const pick = (pattern) => candidates.find((element) => pattern.test(label(element)))
  const target = pick(reject) ?? pick(accept)
  if (target === undefined) return ''
  const text = label(target)
  target.click()

  return text
})()`
