import { NODE_ID_ATTRIBUTE } from '@opencraw/core'

/**
 * The in-page script `recorder-session.use-case.ts` installs on every page
 * of the studio's own headed browser window (`context.addInitScript`),
 * reporting the person's actions to the binding it also exposes on the
 * context (`context.exposeBinding`) — issue #95's "a script injected into
 * every page ... reports the user's actions: click, type, select, key
 * press, scroll".
 *
 * Kept as a plain string, not a TypeScript function passed to
 * `page.evaluate`/`addInitScript`, for the same reason as
 * `page-snapshot/hidden-marks.algorithm.ts`'s `hiddenMarksScript`: it
 * references `window`/`document` as globals, which `AGENTS.md`'s "things
 * that bit before" and the repo's `isolated-functions` lint rule forbid for
 * an in-page TypeScript function.
 *
 * What it reports, and what it deliberately does not:
 *
 * - **click**: the nearest clickable ancestor (`a`, `button`,
 *   `input[type=submit|button]`) of the element clicked, or the element
 *   itself; for an `<a>`, also its `rel`, text and `aria-label` —
 *   `next-link.policy.ts`'s only input.
 * - **fill**: on `blur` of a text-like input/textarea whose value changed
 *   since it was focused (never on every keystroke) — the field's `type`,
 *   `name` and `id`, and the value *as typed*; whether that value is a
 *   secret, and what replaces it, is `secret-field.policy.ts`'s call,
 *   server-side, not this script's.
 * - **select**: on `change` of a `<select>`.
 * - **keypress**: `Enter` only (issue #95's own example, "Press Enter");
 *   every other key is noise a recipe step has no shape for.
 * - **scroll**: once per "scroll session" (debounced), when the page has
 *   been scrolled within `NEAR_BOTTOM_PX` of its bottom.
 * - **unsupported**: once, the first time an event's target sits inside a
 *   shadow root, or this script runs in a frame that is not the top window
 *   (an iframe) — issue #95's explicit out-of-scope cases, reported instead
 *   of attempted.
 *
 * Every reported element is marked with `attribute` (`data-oc-node` by
 * default, `@opencraw/core`'s `NODE_ID_ATTRIBUTE`) if it does not already
 * carry one, the same attribute `selector-inference`'s `pathToNode` reads —
 * so `recorder-session.use-case.ts` can turn a report straight into a
 * verified selector with the phase 2 generator, never inventing its own.
 *
 * @param bindingName - The name Playwright's `exposeBinding` gave the reporting function (`window[bindingName]`).
 * @param attribute - The marker attribute; defaults to `NODE_ID_ATTRIBUTE`.
 * @returns A self-invoking script, ready for `context.addInitScript({ content: recorderScript(...) })`.
 */
export function recorderScript (bindingName: string, attribute: string = NODE_ID_ATTRIBUTE): string {
  return `(() => {
    if (window.top !== window.self) {
      try { window.${bindingName}({ kind: 'unsupported', reason: 'iframe' }) } catch (e) {}
      return
    }
    var attribute = ${JSON.stringify(attribute)}
    var seq = 0
    var unsupportedReported = false
    var scrollTimer = null
    var focusValues = new WeakMap()

    function report (payload) {
      try { window.${bindingName}(payload) } catch (e) {}
    }

    function inShadowDom (element) {
      var root = element.getRootNode ? element.getRootNode() : document
      return root !== document
    }

    function reportUnsupportedOnce (reason) {
      if (unsupportedReported) return
      unsupportedReported = true
      report({ kind: 'unsupported', reason: reason })
    }

    function markNode (element) {
      var id = element.getAttribute(attribute)
      if (id) return id
      seq += 1
      id = 'rec-' + Date.now().toString(36) + '-' + seq
      element.setAttribute(attribute, id)
      return id
    }

    function clickable (element) {
      return element.closest('a, button, input[type="submit"], input[type="button"]') || element
    }

    function isTextEntry (element) {
      var tag = element.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (tag !== 'INPUT') return false
      var type = (element.getAttribute('type') || 'text').toLowerCase()
      return type !== 'submit' && type !== 'button' && type !== 'reset'
    }

    function linkInfo (element) {
      if (element.tagName !== 'A') return undefined
      var aria = element.getAttribute('aria-label')
      return {
        rel:       element.getAttribute('rel') || undefined,
        text:      (element.textContent || '').trim() || undefined,
        ariaLabel: aria || undefined,
      }
    }

    document.addEventListener('click', function (event) {
      var target = event.target
      if (!(target instanceof Element)) return
      if (inShadowDom(target)) { reportUnsupportedOnce('shadow-dom'); return }
      // Clicking into a text field, a textarea or a select to focus it is not itself a recordable
      // action — the fill/select the person then does is what becomes a step, on blur/change.
      if (isTextEntry(target)) return
      var element = clickable(target)
      var id = markNode(element)
      report({ kind: 'click', nodeId: id, html: document.documentElement.outerHTML, link: linkInfo(element) })
    }, true)

    function flushFill (target) {
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return
      if (!focusValues.has(target)) return
      var before = focusValues.get(target)
      focusValues.delete(target)
      if (before === target.value) return
      if (inShadowDom(target)) { reportUnsupportedOnce('shadow-dom'); return }
      var id = markNode(target)
      report({
        kind:  'fill',
        nodeId: id,
        html:  document.documentElement.outerHTML,
        value: target.value,
        field: { type: target.type || undefined, name: target.name || undefined, id: target.id || undefined },
      })
    }

    document.addEventListener('focusin', function (event) {
      var target = event.target
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return
      focusValues.set(target, target.value)
    }, true)

    // Losing focus (Tab, clicking elsewhere) is the ordinary way a fill is reported.
    document.addEventListener('focusout', function (event) { flushFill(event.target) }, true)

    document.addEventListener('change', function (event) {
      var target = event.target
      if (!(target instanceof HTMLSelectElement)) return
      if (inShadowDom(target)) { reportUnsupportedOnce('shadow-dom'); return }
      var id = markNode(target)
      report({
        kind:  'select',
        nodeId: id,
        html:  document.documentElement.outerHTML,
        value: target.value,
        field: { type: 'select', name: target.name || undefined, id: target.id || undefined },
      })
    }, true)

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return
      var target = event.target
      // Enter often submits the very field it was pressed in, which never blurs first — flush its
      // fill now, so typing a query then pressing Enter still reports the fill before the press.
      flushFill(target)
      var id = target instanceof Element && target !== document.body ? markNode(target) : undefined
      report({ kind: 'keypress', nodeId: id, html: id === undefined ? undefined : document.documentElement.outerHTML, key: 'Enter' })
    }, true)

    var NEAR_BOTTOM_PX = 40
    window.addEventListener('scroll', function () {
      if (scrollTimer !== null) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(function () {
        scrollTimer = null
        var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - NEAR_BOTTOM_PX
        if (atBottom) report({ kind: 'scroll', to: 'bottom' })
      }, 300)
    }, true)
  })()`
}
