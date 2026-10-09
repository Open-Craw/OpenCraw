import { withUniqueStepIds } from './unique-step-ids.algorithm'
import type { DocumentTreeNodeView, FieldPick, InferSelectorView, OutlineBracket, OutlineCard, OutlineNode } from '@opencraw/studio'

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
 * Builds a Read card from a document tree pick (studio plan §3.4, issue
 * #94's 5a): a JSON/YAML node's `jsonpath` or an XML node's `xpath`, no
 * selector inference needed — the path *is* the engine's own address for
 * the node, exact by construction (`document-view/tree-view.mapper.ts`).
 *
 * @param node - The picked tree node.
 * @param path - This node's outline path.
 * @param options - `id` (default `"value"`, same convention as `readCardNode`); `generalize` picks the node's `listPath` (every item of its array/repeated sibling group) instead of its own exact path, adding `many: true` — studio plan §3.4's "a value inside a list generalises to the whole list"; `namespaces` carries the document's declared prefixes onto an XML pick (offered, not required — `selectXpath` resolves root-declared `xmlns:*` prefixes on its own; only a default, unprefixed namespace needs naming here).
 * @returns The outline card.
 * @throws Error when the node has neither a `jsonpath` nor an `xpath`, or `generalize` is asked for a node with no `listPath`.
 */
export function documentReadCardNode (
  node: DocumentTreeNodeView,
  path: string,
  options: { id?: string, generalize?: boolean, namespaces?: Record<string, string> } = {},
): OutlineCard {
  const id = options.id ?? DEFAULT_FIELD_ID
  const kind = node.jsonpath === undefined ? 'xpath' : 'jsonpath'
  const exact = node.jsonpath ?? node.xpath
  if (exact === undefined) throw new Error('documentReadCardNode: the node has neither a jsonpath nor an xpath')
  if (options.generalize === true && node.listPath === undefined) throw new Error('documentReadCardNode: this node has no list to generalise to (it is not part of an array or a repeated sibling group)')
  const selector = options.generalize === true ? (node.listPath as string) : exact
  const namespaces = kind === 'xpath' && options.namespaces !== undefined && Object.keys(options.namespaces).length > 0 ? options.namespaces : undefined

  return {
    kind:     'card',
    path,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     { type: 'extract', id, selector, kind, ...(options.generalize === true && { many: true }), ...(namespaces !== undefined && { namespaces }) },
  }
}

/**
 * Builds a `paginate` step's outline node from a picked "next" value (studio
 * plan §3.4, issue #94's 5a): a JSON/YAML tree's cursor or next-page-URL
 * field, read again on every page by `next.jsonpath`. `steps` starts empty —
 * the loop's own body (the page's read cards) is authored afterwards in the
 * Steps outline, the same as any other bracket a pick starts.
 *
 * @param node - The picked "next" value; must have a `jsonpath` (JSON/YAML only — `PaginateNext` has no XPath form).
 * @param path - The new bracket's outline path.
 * @returns The outline bracket.
 * @throws Error when `node` has no `jsonpath`.
 */
export function paginateFromNextNode (node: DocumentTreeNodeView, path: string): OutlineBracket {
  if (node.jsonpath === undefined) throw new Error('paginateFromNextNode: pagination reads a JSON/YAML "next" value (node.jsonpath)')

  return { kind: 'bracket', path, stepType: 'paginate', sentence: [], children: [], step: { type: 'paginate', next: { jsonpath: node.jsonpath }, steps: [] } }
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

/** Splits a JSON list pick's `listPath` (`$.items[*].name`) at its last `[*]`: the path of every item, and the field path read from one item (`$.name`, or `$` for a list of plain values). */
function jsonListParts (node: DocumentTreeNodeView): { items: string, field: string } | undefined {
  if (node.jsonpath === undefined || node.listPath === undefined) return undefined
  const at = node.listPath.lastIndexOf('[*]')
  if (at === -1) return undefined
  const rest = node.listPath.slice(at + 3)

  return { items: node.listPath.slice(0, at + 3), field: rest === '' ? '$' : `$${rest}` }
}

function jsonFieldCard (field: string, path: string, itemAlias: string, id: string): OutlineCard {
  return { kind: 'card', path, stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id, from: itemAlias, selector: field, kind: 'jsonpath', take: 'json' } }
}

/**
 * The list shape for a JSON tree pick (issue #163), the same one the DOM
 * picker builds: an `extract` of every item (`$.items[*]`, `take: json`,
 * `many`), and a `forEach` over them (`emit: true`) whose one child reads the
 * picked field `from` the item. A YAML/XML pick, or a node outside a list,
 * has no such shape here and answers `undefined` (the caller falls back to a
 * single Read card).
 *
 * @param node - The picked tree node.
 * @param path - The item `extract`'s outline path; the `forEach` is its sibling.
 * @returns The two top-level nodes, or `undefined` when `node` is not a JSON list value.
 */
export function documentListOutlineNodes (node: DocumentTreeNodeView, path: string): [OutlineCard, OutlineBracket] | undefined {
  const parts = jsonListParts(node)
  if (parts === undefined) return undefined
  const forEachPath = siblingPath(path)
  const items: OutlineCard = { kind: 'card', path, stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: DEFAULT_ITEMS_ID, selector: parts.items, kind: 'jsonpath', take: 'json', many: true } }
  const forEach: OutlineBracket = {
    kind:     'bracket',
    path:     forEachPath,
    stepType: 'forEach',
    sentence: [],
    children: [jsonFieldCard(parts.field, `${forEachPath}.steps.0`, DEFAULT_ITEM_ALIAS, DEFAULT_FIELD_ID)],
    step:     { type: 'forEach', over: DEFAULT_ITEMS_ID, as: DEFAULT_ITEM_ALIAS, emit: true, steps: [] },
  }

  return [items, forEach]
}

/**
 * A second pick in a list the recipe already loops over: adds the picked
 * field as one more read inside that `forEach` instead of building the loop
 * again (issue #163).
 *
 * @param steps - The current top-level outline nodes.
 * @param node - The picked tree node.
 * @returns The new top-level list, or `undefined` when no existing loop is over this node's list.
 */
export function addJsonListField (steps: readonly OutlineNode[], node: DocumentTreeNodeView): OutlineNode[] | undefined {
  const parts = jsonListParts(node)
  if (parts === undefined) return undefined
  const itemsCard = steps.find(step => step.kind === 'card' && step.step.type === 'extract' && step.step.kind === 'jsonpath' && step.step.selector === parts.items && step.step.many === true)
  const loopIndex = steps.findIndex(step => step.kind === 'bracket' && step.stepType === 'forEach' && step.step.over === itemsCard?.step.id)
  const loop = steps[loopIndex]
  if (itemsCard === undefined || loop?.kind !== 'bracket') return undefined
  const [field] = withUniqueStepIds(steps, [jsonFieldCard(parts.field, `${loop.path}.steps.${loop.children.length}`, String(loop.step.as), DEFAULT_FIELD_ID)])
  const next = steps.map((step, index) => index === loopIndex ? { ...loop, children: [...loop.children, field] } : step)

  return next.map((step, index) => reindexed(step, `steps.${index}`))
}

/**
 * Where a new pick goes when it replaces nothing: the end of the top-level
 * steps, but before a trailing `emit`, which has to stay last for the picked
 * reads to run before the record is emitted (issue #155).
 *
 * @param steps - The current top-level outline nodes.
 * @returns The index a new node is inserted at.
 */
export function appendIndex (steps: readonly OutlineNode[]): number {
  // eslint-disable-next-line unicorn/prefer-at -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2022 Array#at)
  const last = steps[steps.length - 1] as OutlineNode | undefined

  return last?.kind === 'card' && last.stepType === 'emit' ? steps.length - 1 : steps.length
}

/**
 * Inserts (or, at an existing top-level index, replaces) one or more nodes
 * into a recipe's top-level step list — the studio's v1 insertion point:
 * picking always writes to the end of the recipe's own steps (before a
 * trailing `emit`, see {@link appendIndex}), never inside
 * an existing `forEach`/`if`. Reaching into a nested scope from a pick is a
 * real gap, not attempted here (see this phase's final report).
 *
 * @param steps - The current top-level outline nodes.
 * @param replaceAt - The top-level index to replace (e.g. the single `Read` card a first pick made, now upgraded by a second pick into the list shape), or `undefined` to append (at `appendIndex`).
 * @param nodes - The node(s) to insert.
 * @returns A new top-level step list, with every node after the insertion point given a fresh `steps.<n>` path. Inserted nodes are renamed where their ids or aliases would clash with the recipe's (`unique-step-ids.algorithm.ts`, issue #132).
 */
export function spliceTopLevel (steps: readonly OutlineNode[], replaceAt: number | undefined, nodes: readonly OutlineNode[]): OutlineNode[] {
  const kept = replaceAt === undefined ? steps : steps.filter((_, index) => index !== replaceAt)
  const unique = withUniqueStepIds(kept, nodes)
  const at = appendIndex(steps)
  const next = replaceAt === undefined
    ? [...steps.slice(0, at), ...unique, ...steps.slice(at)]
    : [...steps.slice(0, replaceAt), ...unique, ...steps.slice(replaceAt + 1)]

  const emitsInLoop = unique.some(node => node.kind === 'bracket' && node.stepType === 'forEach' && node.step.emit === true)
  // eslint-disable-next-line unicorn/prefer-at -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2022 Array#at)
  const settled = emitsInLoop && isBareEmit(next[next.length - 1]) ? next.slice(0, -1) : next

  return settled.map((node, index) => reindexed(node, `steps.${index}`))
}

/** A top-level `emit` card, the starter recipe's closing step. Once a picked `forEach` emits each item, it would emit one more record outside the loop (issue #157). */
function isBareEmit (node: OutlineNode | undefined): boolean {
  return node?.kind === 'card' && node.stepType === 'emit'
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
