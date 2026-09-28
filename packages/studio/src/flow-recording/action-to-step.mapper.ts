import type { Step } from '@opencraw/core'
import type { ResolvedAction } from './recorded-action.contract'

type ClickStep = Extract<Step, { type: 'click' }>
type FillStep = Extract<Step, { type: 'fill' }>
type SelectStep = Extract<Step, { type: 'select' }>
type PressStep = Extract<Step, { type: 'press' }>
type ScrollStep = Extract<Step, { type: 'scroll' }>

/**
 * Turns one resolved recorded action into the recipe step it reads as
 * (issue #95's card sentences): `Click <selector>`, `Fill <selector> with
 * <value>`, `Select <selector> = <value>`, `Press <key>`, `Scroll to
 * bottom`. Pure: `recorder-session.use-case.ts` has already resolved the
 * selector (`selector-inference`) and, for a secret field, already replaced
 * `value` with its `{{env.NAME}}` placeholder (`secret-field.policy.ts`) —
 * this mapper never sees, and so can never leak, a real secret value.
 *
 * @param action - The resolved action.
 * @returns The step it becomes, or `undefined` for an action this mapper cannot place (a click/fill/select with no verified selector).
 */
export function actionToStep (action: ResolvedAction): Step | undefined {
  switch (action.kind) {
    case 'click': {
      if (action.selector === undefined) return undefined
      const step: ClickStep = { type: 'click', selector: action.selector }

      return step
    }
    case 'fill': {
      if (action.selector === undefined) return undefined
      const step: FillStep = { type: 'fill', selector: action.selector, value: action.value ?? '' }

      return step
    }
    case 'select': {
      if (action.selector === undefined) return undefined
      const step: SelectStep = { type: 'select', selector: action.selector, value: action.value }

      return step
    }
    case 'keypress': {
      const key = action.key ?? 'Enter'
      const step: PressStep = action.selector === undefined ? { type: 'press', key } : { type: 'press', selector: action.selector, key }

      return step
    }
    case 'scroll': {
      const step: ScrollStep = { type: 'scroll', to: 'bottom' }

      return step
    }
  }
}
