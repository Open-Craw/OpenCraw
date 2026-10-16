/** The attribute a pop-up that covers the page is marked with in the snapshot; the picture leaves it out unless "Show hidden" is on. */
export const OVERLAY_ATTRIBUTE = 'data-oc-overlay'

/**
 * A script that, in a page, finds a cookie or consent banner's button and presses it: "Reject all", "Only necessary cookies" and the
 * like first, else "Accept all", "I agree"... in English, Portuguese, Spanish, French, Italian, German and Dutch, and by the ids the common
 * consent tools give their buttons (OneTrust, Didomi, Cookiebot, Usercentrics, Osano, iubenda). A banner that is left in place covers the
 * page in the Studio's view of it, and the Studio's own clicks (to pick a value) would land on it. Only buttons whose whole text is one
 * of these are pressed, so a "Cookie settings" or "Gerir os cookies" button, a link to a policy and the page's own buttons are left alone.
 * The answer is the text of the button pressed, or an empty string when there was none.
 *
 * It only ever runs in the browser the Studio captures the page with, never in a crawl.
 */
export const DISMISS_CONSENT_SCRIPT = String.raw`(() => {
  const rejectIds = ['#onetrust-reject-all-handler', '#didomi-notice-disagree-button', '#CybotCookiebotDialogBodyButtonDecline', '[data-testid=uc-deny-all-button]', '.osano-cm-denyAll', '.iubenda-cs-reject-btn', '.cmp-button_button--reject', '#truste-consent-required', 'button[id*=reject i]', 'button[id*=decline i]']
  const acceptIds = ['#onetrust-accept-btn-handler', '#didomi-notice-agree-button', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '[data-testid=uc-accept-all-button]', '.osano-cm-accept-all', '.iubenda-cs-accept-btn', 'button[id*=accept i]']
  const rejectWords = ['reject', 'decline', 'deny', 'refuse', 'rejeitar', 'recusar', 'nao aceitar', 'rechazar', 'refuser', 'rifiuta', 'rifiutare', 'ablehnen', 'weigeren', 'only necessary', 'only essential', 'necessary only', 'essential only', 'apenas necessarios', 'apenas essenciais', 'somente necessarios', 'solo necesarias', 'solo necessari', 'uniquement necessaires', 'uniquement essentiels', 'nur notwendige', 'nur erforderliche', 'alleen noodzakelijke', 'continue without accepting', 'continuar sem aceitar', 'continuar sin aceptar', 'continuer sans accepter', 'continua senza accettare', 'no thanks', 'nao obrigado']
  const acceptWords = ['accept', 'allow', 'agree', 'i agree', 'i accept', 'ok', 'okay', 'got it', 'yes i agree', 'yes these cookies are ok', 'aceitar', 'aceito', 'concordo', 'permitir', 'aceptar', 'acepto', 'permitir todas', 'accepter', 'j accepte', 'accetta', 'accetto', 'akzeptieren', 'zustimmen', 'einverstanden', 'accepteren']
  const tail = '(?:\\s+(?:all|todos|todas|todo|tudo|tout|tous|tutti|tutte|alle|alles|os|as|las|los|les|i|le|the|die))*(?:\\s+(?:cookies?|kekse|koekjes))?'
  const rejectText = new RegExp('^(?:' + rejectWords.join('|') + ')' + tail + '$')
  const acceptText = new RegExp('^(?:' + acceptWords.join('|') + ')' + tail + '$')
  const visible = (element) => {
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)

    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
  }
  const plain = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const label = (element) => (element.innerText || element.value || element.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')
  const byId = (selectors) => {
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)].find(visible)
      if (found !== undefined) return found
    }

    return undefined
  }
  const candidates = [...document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')].filter(visible)
  const byText = (pattern) => candidates.find((element) => pattern.test(plain(label(element))))
  const target = byId(rejectIds) ?? byText(rejectText) ?? byId(acceptIds) ?? byText(acceptText)
  if (target === undefined) return ''
  const text = label(target)
  target.click()

  return text || target.id
})()`

/**
 * A script that marks, in the page, every pop-up that covers it: something fixed to the window that fills most of it (a dimming backdrop,
 * a modal), a modal dialog, or a banner a consent tool put there. The picture of the page leaves them out (the page behind is what the
 * person wants to pick from), and "Show hidden" brings them back. Run after the consent button has been tried: a banner that went away
 * needs nothing, one that stayed (its button in a form the script does not know, an icon with no text) is covered here.
 *
 * Only the outermost element of an overlay is marked, since hiding it hides all it holds.
 */
export const MARK_OVERLAYS_SCRIPT = `(() => {
  const attribute = 'data-oc-overlay'
  const consentName = /cookie|consent|gdpr|privacy|onetrust|ot-sdk|didomi|cookiebot|usercentrics|trustarc|truste|osano|iubenda|cmp|banner-modal/i
  const width = window.innerWidth
  const height = window.innerHeight
  const marked = []
  for (const element of document.querySelectorAll('body *')) {
    if (marked.some((outer) => outer.contains(element))) continue
    const style = getComputedStyle(element)
    if (style.position !== 'fixed' || style.display === 'none' || style.visibility === 'hidden') continue
    const box = element.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) continue
    const covers = box.width >= width * 0.6 && box.height >= height * 0.5
    const modal = element.getAttribute('aria-modal') === 'true' || element.getAttribute('role') === 'dialog' || element.getAttribute('role') === 'alertdialog'
    const named = consentName.test((element.id || '') + ' ' + (typeof element.className === 'string' ? element.className : ''))
    // A page built as one fixed, scrolling frame is the page, not a pop-up on it.
    if (covers && !modal && !named && (element.innerText || '').length > document.body.innerText.length * 0.6) continue
    // A bar along an edge (a site's own header or footer) is not a pop-up unless a consent tool named it.
    if (covers || modal || named) {
      element.setAttribute(attribute, '1')
      marked.push(element)
    }
  }

  return marked.length
})()`
