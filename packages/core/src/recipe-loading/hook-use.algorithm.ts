import type { InputRecipe, MappingRule, Step } from '../recipe-schema'

/** A place where a recipe calls a hook by name. */
export interface HookUse {
  recipeId: string
  /** `steps.2.steps.0` for a `hook` step, `mapping.price.transform.1` for a `hook` transform. */
  path:     string
  name:     string
}

/**
 * Every hook an input recipe calls: `hook` steps (the bootstrap's included) and `hook` transforms (inside
 * `each` rules included), so a crawler can check them all before its first request.
 *
 * @param input - An input recipe.
 * @returns The uses, in recipe order.
 */
export function hookUses (input: InputRecipe): HookUse[] {
  const uses: HookUse[] = []
  const found = (path: string, name: string): void => { uses.push({ recipeId: input.id, path, name }) }
  stepHooks(input.steps, 'steps', found)
  stepHooks(input.session?.bootstrap?.steps ?? [], 'session.bootstrap.steps', found)
  for (const [target, rule] of Object.entries(input.mapping)) ruleHooks(rule, `mapping.${target}`, found)

  return uses
}

function stepHooks (steps: readonly Step[], path: string, found: (path: string, name: string) => void): void {
  for (const [index, step] of steps.entries()) {
    const at = `${path}.${index}`
    if (step.type === 'hook') found(at, step.name)
    if ('steps' in step) stepHooks(step.steps, `${at}.steps`, found)
    if (step.type === 'if') stepHooks(step.else ?? [], `${at}.else`, found)
  }
}

function ruleHooks (rule: MappingRule, path: string, found: (path: string, name: string) => void): void {
  if ('each' in rule) {
    for (const [name, nested] of Object.entries(rule.fields)) ruleHooks(nested, `${path}.fields.${name}`, found)

    return
  }
  const transforms = rule.transform ?? []
  for (const [index, transform] of transforms.entries()) {
    if (transform.op === 'hook') found(`${path}.transform.${index}`, transform.name)
  }
}
