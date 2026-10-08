/** Less text than this, with no media or form element, is a shell with a footnote, not a page: the BYD configurator's JavaScript shell holds one 71-character disclaimer. */
const MIN_VISIBLE_TEXT = 100

/** Elements whose presence means the page shows something even without text. */
const MEDIA_SELECTOR = 'img, picture, video, canvas, svg, iframe, object, embed, input, select, textarea, table'

/**
 * Whether a snapshot document would show anything to click on once its
 * scripts are off (issue #135): a few sentences of text, or a media/form element. A page
 * that builds its content with JavaScript arrives as a shell (`<div id="app">`
 * and a bundle), and the snapshot frame renders it as a blank page.
 *
 * @param html - The rewritten snapshot document.
 * @returns `false` for a document with almost no text and no media or form element in its body.
 */
export function hasVisibleContent (html: string): boolean {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  for (const hidden of body.querySelectorAll('script, style, noscript, template')) hidden.remove()
  if ((body.textContent ?? '').trim().length >= MIN_VISIBLE_TEXT) return true

  return body.querySelector(MEDIA_SELECTOR) !== null
}
