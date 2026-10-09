/** Less text than this, with no media or form element, is a shell with a footnote, not a page: the BYD configurator's JavaScript shell holds one 71-character disclaimer. */
const MIN_VISIBLE_TEXT = 100

/** Elements whose presence means the page shows something even without text. */
const MEDIA_SELECTOR = 'img, picture, video, canvas, svg, iframe, object, embed, input, select, textarea, table'

/** A heading, list item or link is something to click on: a small catalog page has little text but plenty of structure (issue #145). */
const STRUCTURE_SELECTOR = 'h1, h2, h3, h4, h5, h6, li, a[href]'

/**
 * Whether a snapshot document would show anything to click on once its
 * scripts are off (issue #135): a few sentences of text, a media/form element, or a heading, list item or link. A page
 * that builds its content with JavaScript arrives as a shell (`<div id="app">`
 * and a bundle), and the snapshot frame renders it as a blank page.
 *
 * @param html - The rewritten snapshot document.
 * @returns `false` for a document with almost no text and no media, form, heading, list or link in its body.
 */
export function hasVisibleContent (html: string): boolean {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  for (const hidden of body.querySelectorAll('script, style, noscript, template')) hidden.remove()
  if ((body.textContent ?? '').trim().length >= MIN_VISIBLE_TEXT) return true

  return body.querySelector(`${MEDIA_SELECTOR}, ${STRUCTURE_SELECTOR}`) !== null
}
