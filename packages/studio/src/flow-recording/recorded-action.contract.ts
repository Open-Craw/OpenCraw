import { z } from 'zod'

/** The kinds of user action the in-page recorder script (`recorder-script.client.ts`) reports. */
export const RECORDED_ACTION_KINDS = ['click', 'fill', 'select', 'keypress', 'scroll'] as const
export type RecordedActionKind = typeof RECORDED_ACTION_KINDS[number]

/** Why a report was refused before it became an action: out of this phase's scope (issue #95). */
export const UNSUPPORTED_REASONS = ['iframe', 'shadow-dom'] as const
export type UnsupportedReason = typeof UNSUPPORTED_REASONS[number]

/**
 * The type/name/id of the form field a `fill`/`select` landed on, exactly as
 * the live DOM reports them — `secret-field.policy.ts`'s only input. Never
 * carries the field's value: that travels separately, on the action itself.
 */
export const recordedFieldSchema = z.object({
  type: z.string().optional(),
  name: z.string().optional(),
  id:   z.string().optional(),
})
export type RecordedField = z.infer<typeof recordedFieldSchema>

/** What `next-link.policy.ts` needs off a clicked anchor: never the whole element. */
export const recordedLinkSchema = z.object({
  rel:       z.string().optional(),
  text:      z.string().optional(),
  ariaLabel: z.string().optional(),
})
export type RecordedLink = z.infer<typeof recordedLinkSchema>

/**
 * The wire shape of one action as `recorder-script.client.ts` reports it,
 * over the Playwright binding `recorder-session.use-case.ts` exposes: the
 * `data-oc-node` id of the element involved (`selector-inference`'s own
 * marker attribute, `@opencraw/core`'s `NODE_ID_ATTRIBUTE`), never a
 * selector — the studio, not the page, decides that (studio plan §3.2,
 * issue #95). Never the field's real value when it might be a secret: the
 * script itself does not know which fields are secret (`secret-field.policy.ts`
 * runs server-side, once a `RecordedField` is known), but nothing here
 * *requires* a value to be typed out either way — `recorder-session.use-case.ts`
 * discards it the moment a secret is detected.
 *
 * `html` is the document's own markup, captured by the script itself at the
 * moment of the event (`document.documentElement.outerHTML`), not fetched
 * again afterwards: a click that navigates can leave the page before a
 * later `page.content()` call would resolve, reading the *next* page's
 * markup instead of the one the click actually happened on. Capturing it
 * synchronously, in the same event the node id is stamped in, means the
 * selector is always resolved against the exact document the action
 * happened on — still "verified against the page" (issue #95), just without
 * the race a second round trip would risk.
 */
export const rawActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), nodeId: z.string().min(1), html: z.string().min(1), link: recordedLinkSchema.optional() }),
  z.object({ kind: z.literal('fill'), nodeId: z.string().min(1), html: z.string().min(1), value: z.string(), field: recordedFieldSchema.optional() }),
  z.object({ kind: z.literal('select'), nodeId: z.string().min(1), html: z.string().min(1), value: z.string(), field: recordedFieldSchema.optional() }),
  z.object({ kind: z.literal('keypress'), nodeId: z.string().min(1).optional(), html: z.string().optional(), key: z.string().min(1) }),
  z.object({ kind: z.literal('scroll'), to: z.literal('bottom') }),
  z.object({ kind: z.literal('unsupported'), reason: z.enum(UNSUPPORTED_REASONS) }),
])
export type RawAction = z.infer<typeof rawActionSchema>

/**
 * One action once `recorder-session.use-case.ts` has resolved it against the
 * live page: `selector` comes from the phase 2 generator
 * (`selector-inference`'s `candidatesFor`/`rankCandidates`), verified
 * against the page it was recorded on, per issue #95. `value` already holds
 * a `{{env.NAME}}` placeholder, never a real secret, once `secret-field.policy.ts`
 * has flagged the field. `navigated` is set when the action's page changed
 * (a click or a key press that submitted a form/followed a link).
 */
export interface ResolvedAction {
  kind:       RecordedActionKind
  selector?:  string
  value?:     string
  key?:       string
  field?:     RecordedField
  link?:      RecordedLink
  navigated?: { url: string, status?: number }
}
