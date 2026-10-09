import type { OutlineNode } from '@opencraw/studio'
import { DEFAULT_HOOK_NAME } from '../hook-names'

/** The `+` menu's offerings: label, the step it builds, and whether that step opens a bracket. */
export interface NewStepOption {
  label:    string
  stepType: string
  bracket:  boolean
}

export const NEW_STEP_OPTIONS: readonly NewStepOption[] = [
  { label: 'Go to', stepType: 'goto', bracket: false },
  { label: 'Read', stepType: 'extract', bracket: false },
  { label: 'Loop', stepType: 'forEach', bracket: true },
  { label: 'Next page', stepType: 'paginate', bracket: true },
  { label: 'If', stepType: 'if', bracket: true },
  { label: 'Fill form', stepType: 'fill', bracket: false },
  { label: 'Click', stepType: 'click', bracket: false },
  { label: 'Set', stepType: 'set', bracket: false },
  { label: 'Collect', stepType: 'collect', bracket: false },
  { label: 'Hook', stepType: 'hook', bracket: false },
  { label: 'Emit', stepType: 'emit', bracket: false },
]

/**
 * A minimal, schema-valid default for a step type the `+` menu offers: just
 * enough for it to round-trip and render as a sentence right away. The
 * person fills in the rest through the expanded form.
 *
 * @param stepType - One of `NEW_STEP_OPTIONS`' `stepType`s.
 * @param hookName - The name a new `hook` step starts with: a hook step needs a name to be a valid recipe at all (issue #202).
 * @returns The new step's raw JSON.
 */
export function newStep (stepType: string, hookName = DEFAULT_HOOK_NAME): Record<string, unknown> {
  switch (stepType) {
    case 'goto': { return { type: 'goto', url: '' }
    }
    case 'extract': { return { type: 'extract', id: 'value', selector: '', kind: 'css' }
    }
    case 'forEach': { return { type: 'forEach', as: 'item', over: '', steps: [] }
    }
    case 'paginate': { return { type: 'paginate', next: { selector: '' }, steps: [] }
    }
    case 'if': { return { type: 'if', test: '', steps: [] }
    }
    case 'fill': { return { type: 'fill', selector: '', value: '' }
    }
    case 'click': { return { type: 'click', selector: '' }
    }
    case 'set': { return { type: 'set', id: 'value', value: '' }
    }
    case 'collect': { return { type: 'collect', into: '', value: '' }
    }
    case 'hook': { return { type: 'hook', name: hookName }
    }
    case 'emit': { return { type: 'emit' }
    }
    default: { return { type: stepType }
    }
  }
}

/**
 * A new node for the outline tree at `path`, standing in until the server's
 * own `save-outline` round trip (`scope-outline`'s real `recipeToOutline`)
 * hands back the recipe's authoritative outline with this step's real
 * sentence: `apps/studio-ui` never imports `@opencraw/studio`'s runtime
 * mappers (they sit in a Node-only bundle), so this local placeholder is
 * deliberately plain rather than a copy of `card-sentence.mapper.ts`'s rules.
 *
 * @param stepType - One of `NEW_STEP_OPTIONS`' `stepType`s.
 * @param path - Where the node goes in the tree.
 * @param hookName - The name a new `hook` step starts with.
 * @returns The node to insert; a bracket for a container type, a card otherwise.
 */
const BRACKET_STEP_TYPES = ['forEach', 'paginate', 'if'] as const

export function newStepNode (stepType: string, path: string, hookName = DEFAULT_HOOK_NAME): OutlineNode {
  const step = newStep(stepType, hookName)
  const sentence = [{ kind: 'word' as const, text: NEW_STEP_OPTIONS.find(option => option.stepType === stepType)?.label ?? stepType }]
  const bracketType = BRACKET_STEP_TYPES.find(type => type === stepType)
  if (bracketType !== undefined) {
    return { kind: 'bracket', path, stepType: bracketType, sentence, step, children: [] }
  }

  return { kind: 'card', path, stepType, sentence, step, custom: false }
}
