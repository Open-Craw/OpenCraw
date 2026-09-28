import type { FieldPick, InferSelectorView, OutlineBracket, OutlineCard, OutlineNode } from '@opencraw/studio'

/** A safe default field id: a `Read` card's picked value has no name from the user in v1 (naming fields is the Record tab's job, phase 3, #92) — `value` is renamed in the JSON/Record tab like any other id. */
const DEFAULT_FIELD_ID = 'value'
const DEFAULT_ITEMS_ID = 'items'
const DEFAULT_ITEM_ALIAS = 'item'

/**
 * Builds a single `Read` card (an `extract` step) from one pick's field
 * (studio plan §3.2, issue #91): `kind: "css"`, the verified selector, and
 * `take` only when it is not the default (`text`).
 *
 * @param field - The verified field pick (`infer-selector`'s `"field"` result).
 * @param path - This node's outline path (informational; `outline-to-recipe.mapper.ts` does not read it, only the Steps outline's own scope/highlight logic does).
 * @param id - The step's own id; defaults to `"value"` since v1 picking does not ask for a field name.
 * @returns The outline card, ready to insert with `save-outline`.
 */
export function readCardNode (field: FieldPick, path: string, id: string = DEFAULT_FIELD_ID): OutlineCard {
  return {
    kind:     'card',
    path,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     { type: 'extract', id, selector: field.selector, kind: 'css', ...((field.take !== 'text') && { take: field.take }) },
  }
}

/**
 * Builds the safe list shape by construction (studio plan §3.2, issue #91):
 * an `extract` of every item (`take: "html", many: true`), and a `forEach`
 * over them (`emit: true`) whose one child reads the field `from` the item —
 * never a selector run against the whole document and zipped by index, so
 * the wrapper-trap and shifted-field bugs (`docs/recipes/authoring.md` §4.5)
 * cannot be built this way.
 *
 * @param result - `infer-selector`'s `"list"` result.
 * @param path - The item `extract`'s outline path; the `forEach`'s own path is computed as its sibling, and the field card's as the `forEach`'s first child.
 * @param ids - The three ids the shape needs; all default (`items`/`item`/`value`) when a card is inserted fresh rather than replacing one that already had names.
 * @returns The two top-level outline nodes (the item `extract` and the `forEach`), in order.
 */
export function listOutlineNodes (
  result: Extract<InferSelectorView, { kind: 'list' }>,
  path: string,
  ids: { itemsId?: string, itemAlias?: string, fieldId?: string } = {},
): [OutlineCard, OutlineBracket] {
  const itemsId = ids.itemsId ?? DEFAULT_ITEMS_ID
  const itemAlias = ids.itemAlias ?? DEFAULT_ITEM_ALIAS
  const fieldId = ids.fieldId ?? DEFAULT_FIELD_ID
  const forEachPath = siblingPath(path)
  const items: OutlineCard = {
    kind:     'card',
    path,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     { type: 'extract', id: itemsId, selector: result.item.selector, kind: 'css', take: 'html', many: true },
  }
  const field: OutlineCard = {
    kind:     'card',
    path:     `${forEachPath}.steps.0`,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     { type: 'extract', id: fieldId, from: itemAlias, selector: result.field.selector, kind: 'css', ...((result.field.take !== 'text') && { take: result.field.take }) },
  }
  const forEach: OutlineBracket = {
    kind:     'bracket',
    path:     forEachPath,
    stepType: 'forEach',
    sentence: [],
    children: [field],
    step:     { type: 'forEach', over: itemsId, as: itemAlias, emit: true, steps: [] },
  }

  return [items, forEach]
}

/**
 * Inserts (or, at an existing top-level index, replaces) one or more nodes
 * into a recipe's top-level step list — the studio's v1 insertion point:
 * picking always writes to the end of the recipe's own steps, never inside
 * an existing `forEach`/`if`. Reaching into a nested scope from a pick is a
 * real gap, not attempted here (see this phase's final report).
 *
 * @param steps - The current top-level outline nodes.
 * @param replaceAt - The top-level index to replace (e.g. the single `Read` card a first pick made, now upgraded by a second pick into the list shape), or `undefined` to append.
 * @param nodes - The node(s) to insert.
 * @returns A new top-level step list, with every node after the insertion point given a fresh `steps.<n>` path.
 */
export function spliceTopLevel (steps: readonly OutlineNode[], replaceAt: number | undefined, nodes: readonly OutlineNode[]): OutlineNode[] {
  const next = replaceAt === undefined
    ? [...steps, ...nodes]
    : [...steps.slice(0, replaceAt), ...nodes, ...steps.slice(replaceAt + 1)]

  return next.map((node, index) => reindexed(node, `steps.${index}`))
}

function reindexed (node: OutlineNode, path: string): OutlineNode {
  if (node.kind === 'card') return { ...node, path }

  return { ...node, path, children: node.children.map((child, index) => reindexed(child, `${path}.steps.${index}`)) }
}

function siblingPath (path: string): string {
  const segments = path.split('.')
  // eslint-disable-next-line unicorn/prefer-at -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2022 Array#at)
  const last = Number(segments[segments.length - 1])

  return [...segments.slice(0, -1), String(last + 1)].join('.')
}
