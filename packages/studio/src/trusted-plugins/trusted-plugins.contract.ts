import type { AccessPlugin, CaptchaSolver, HookMap } from '@opencraw/core'

/**
 * Code the person who started Studio chose to run (`opencraw studio --hooks <file>`, issue #150): the
 * hooks, access plugins and captcha solvers a recipe names. It is loaded once at launch, never at a
 * recipe's or a browser request's say-so, so it has the trust of the command line it came from.
 */
export interface TrustedPlugins {
  /** The file it was loaded from, shown to the person in the UI and in errors. */
  source:          string
  hooks:           HookMap
  accessPlugins?:  AccessPlugin[]
  captchaSolvers?: CaptchaSolver[]
}
