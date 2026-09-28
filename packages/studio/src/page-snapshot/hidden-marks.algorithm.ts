/** The attribute `hiddenMarksScript` stamps on an element hidden on the live page. */
export const HIDDEN_ATTRIBUTE = 'data-oc-hidden'

/**
 * The in-page script `take-snapshot.use-case.ts` runs with `page.evaluate`
 * *before* `page.content()`, so a `display: none`/`visibility: hidden`/
 * zero-size element carries `data-oc-hidden="1"` into the captured markup
 * (studio plan §3.1, issue #91) — the only way to know an element was
 * hidden on the live page, since a static parse of the HTML afterwards has
 * no computed style to ask.
 *
 * Kept as a plain string, not a TypeScript function passed to
 * `page.evaluate`, because it references `window`/`document` as globals: `AGENTS.md`'s
 * "things that bit before" calls out that in-page functions must not do
 * that (the repo's `isolated-functions` lint rule), and every existing
 * `page.evaluate` call with real DOM logic in this codebase (see
 * `packages/core/src/captcha/resolve-captcha.use-case.ts`) already uses
 * this same string-template shape.
 *
 * @param attribute - The attribute to stamp; defaults to `HIDDEN_ATTRIBUTE` (parameterised for tests and for a future caller that wants a different name).
 * @returns A self-invoking script, ready for `page.evaluate(hiddenMarksScript())`.
 */
export function hiddenMarksScript (attribute: string = HIDDEN_ATTRIBUTE): string {
  return `(() => {
    var attribute = ${JSON.stringify(attribute)}
    var elements = document.querySelectorAll('*')
    for (var i = 0; i < elements.length; i++) {
      var element = elements[i]
      var style = window.getComputedStyle(element)
      var rect = element.getBoundingClientRect()
      var hidden = style.display === 'none' || style.visibility === 'hidden' || (rect.width === 0 && rect.height === 0)
      if (hidden) element.setAttribute(attribute, '1')
    }
  })()`
}
