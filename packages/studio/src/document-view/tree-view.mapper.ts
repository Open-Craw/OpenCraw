import { parseXml } from '@opencraw/core'
import type { HttpBody } from '@opencraw/core'

const TEXT_LIMIT = 120

/** A JSON/XML value's shape, for the tree's icon and for deciding whether a node can generalise to a list. */
export type TreeValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'element'

/** One row of the document tree (studio plan §3.4, issue #94's 5a): a JSON/YAML value or an XML element/attribute. */
export interface DocumentTreeNode {
  /** A stable key for React lists: the node's own path. */
  id:          string
  /** The property name, array index or element/attribute name to show. */
  label:       string
  valueType:   TreeValueType
  /** A short rendering of a leaf's value; absent for `object`/`array`/`element`. */
  preview?:    string
  /** This exact node's JSONPath (JSON/YAML documents only). */
  jsonpath?:   string
  /** This exact node's XPath (XML documents only). */
  xpath?:      string
  /**
   * Set when this node is one item of an array (JSON) or one of several
   * same-named siblings (XML): the path generalised to every item —
   * `$.results[*]` instead of `$.results[2]` — and how many there are, so a
   * pick can offer "the whole list" per studio plan §3.4.
   */
  listPath?:   string
  listCount?:  number
  /** XML only: the element's own attributes, name -> value (also reachable as child rows). */
  attributes?: Record<string, string>
  children:    DocumentTreeNode[]
}

/** What `document-tree` answers with: the parsed document as a tree, and (XML only) the namespace prefixes it declares or that reading synthesised for an unprefixed default namespace, offered so a pick's `extract` can reference them (studio plan §3.4). */
export interface DocumentTreeView {
  format:      'json' | 'xml'
  root:        DocumentTreeNode
  namespaces?: Record<string, string>
}

/**
 * Builds the document tree for `document-tree` (studio plan §3.4, issue
 * #94's 5a) from the body `page-snapshot`'s `take-snapshot.use-case.ts`
 * already fetched — no second read of the document.
 *
 * @param body - The parsed body (`HttpBody`); YAML and JSON Lines both
 * arrive here already normalised to `{ kind: 'json' }` by `http.client.ts`.
 * @returns The tree.
 * @throws Error when `body`'s kind is not `json` or `xml` (PDF, workbook and
 * deck documents get their own canvases — 5b/5c/5d, not this mapper).
 */
export function documentTreeView (body: HttpBody): DocumentTreeView {
  if (body.kind === 'json') return { format: 'json', root: jsonNode(body.data, '$', 'root') }
  if (body.kind === 'xml') return xmlTreeView(body.xml)

  throw new Error(`document-tree: "${body.kind}" has no tree canvas (only "json" and "xml" bodies do)`)
}

/**
 * The nearest enclosing array (JSON) or repeated-sibling group (XML) a node
 * sits inside, for computing its `listPath`/`listCount`: `itemPrefix` is
 * this node's own exact path up to (and including) the repeated step,
 * `generalPrefix` the same prefix with that step replaced by `[*]`/the bare
 * tag name, and `count` how many items/siblings there are. A node with no
 * such ancestor gets no `listPath` at all (studio plan §3.4).
 */
interface ListContext {
  itemPrefix:    string
  generalPrefix: string
  count:         number
}

function listFields (path: string, context: ListContext | undefined): Pick<DocumentTreeNode, 'listPath' | 'listCount'> {
  if (context === undefined) return {}

  return { listPath: context.generalPrefix + path.slice(context.itemPrefix.length), listCount: context.count }
}

function jsonNode (value: unknown, path: string, label: string, context?: ListContext): DocumentTreeNode {
  if (Array.isArray(value)) {
    const children = value.map((item, index) => {
      const itemPath = `${path}[${index}]`

      return jsonNode(item, itemPath, String(index), { itemPrefix: itemPath, generalPrefix: `${path}[*]`, count: value.length })
    })

    return { id: path, label, valueType: 'array', jsonpath: path, ...listFields(path, context), children }
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    // A plain object passes its own context through unchanged: only an array (or, in XML, a repeated element) starts a new one.
    const children = entries.map(([key, item]) => jsonNode(item, `${path}${propertyAccess(key)}`, key, context))

    return { id: path, label, valueType: 'object', jsonpath: path, ...listFields(path, context), children }
  }

  return { id: path, label, valueType: leafType(value), jsonpath: path, preview: previewOf(value), ...listFields(path, context), children: [] }
}

function leafType (value: unknown): TreeValueType {
  if (value === null) return 'null'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'

  return 'string'
}

function previewOf (value: unknown): string {
  const text = value === null ? 'null' : (typeof value === 'string' ? value : JSON.stringify(value))

  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text
}

/** A JSONPath property step: dot notation for a plain identifier, bracket notation (quoted) otherwise — jsonpath-plus accepts both, but only dot notation round-trips through a person reading the card. */
function propertyAccess (key: string): string {
  return /^[A-Z_]\w*$/i.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`
}

// --- XML ---

const DEFAULT_NS_PREFIX = 'ns'

function xmlTreeView (xml: string): DocumentTreeView {
  const document = parseXml(xml, 'document.xml')
  const root = document.documentElement
  if (root === null) throw new Error('document-tree: the XML document has no root element')
  const namespaces = declaredNamespaces(root)
  const tree = xmlNode(root, '', namespaces, undefined)

  return { format: 'xml', root: tree, ...(Object.keys(namespaces).length > 0 && { namespaces }) }
}

/** Every `xmlns:*` the root declares, plus a synthesised prefix (`ns`, `ns2`, …) for a bare default `xmlns="…"` — XPath 1.0 has no default namespace, so a query needs a prefix even when the markup does not use one (mirrors `xpath.algorithm.ts`'s own `declaredPrefixes`, extended for the default case that function leaves out on purpose — it is resolved automatically there, but a *picked* card still needs to name it explicitly in `namespaces`). */
function declaredNamespaces (root: Element): Record<string, string> {
  const namespaces: Record<string, string> = {}
  let synthetic = 0
  for (const attribute of root.attributes) {
    if (attribute.prefix === 'xmlns') namespaces[attribute.localName] = attribute.value
    else if (attribute.name === 'xmlns') {
      synthetic += 1
      namespaces[synthetic === 1 ? DEFAULT_NS_PREFIX : `${DEFAULT_NS_PREFIX}${synthetic}`] = attribute.value
    }
  }

  return namespaces
}

function prefixFor (element: Element, namespaces: Record<string, string>): string | undefined {
  if (element.namespaceURI === null || element.namespaceURI === undefined) return undefined
  if (element.prefix !== null && element.prefix !== undefined && element.prefix !== '') return element.prefix

  return Object.entries(namespaces).find(([, uri]) => uri === element.namespaceURI)?.[0]
}

function qualifiedName (element: Element, namespaces: Record<string, string>): string {
  const prefix = prefixFor(element, namespaces)

  return prefix === undefined ? element.localName ?? element.tagName : `${prefix}:${element.localName ?? element.tagName}`
}

function xmlNode (element: Element, parentPath: string, namespaces: Record<string, string>, context: ListContext | undefined): DocumentTreeNode {
  const name = qualifiedName(element, namespaces)
  const siblingIndex = elementSiblingIndex(element)
  const siblingCount = elementSiblingCount(element)
  const step = siblingCount > 1 ? `${name}[${siblingIndex}]` : name
  const path = `${parentPath}/${step}`
  // I am one of several same-named siblings: my own listPath generalises myself, and my children inherit *my* context (innermost repetition wins) instead of whatever ancestor context I received.
  const selfContext: ListContext | undefined = siblingCount > 1 ? { itemPrefix: path, generalPrefix: `${parentPath}/${name}`, count: siblingCount } : context
  const childContext = siblingCount > 1 ? selfContext : context
  const attributes = elementAttributes(element)
  const childElements = [...element.childNodes].filter((node): node is Element => node.nodeType === 1)
  const children: DocumentTreeNode[] = [
    ...Object.entries(attributes).map(([key, value]) => attributeNode(key, value, path, childContext)),
    ...childElements.map(child => xmlNode(child, path, namespaces, childContext)),
  ]
  const text = childElements.length === 0 ? textOf(element) : undefined

  return {
    id:        path,
    label:     name,
    valueType: 'element',
    xpath:     path,
    ...listFields(path, selfContext),
    ...(Object.keys(attributes).length > 0 && { attributes }),
    ...(text !== undefined && { preview: text, valueType: childElements.length === 0 ? 'string' : 'element' }),
    children,
  }
}

function attributeNode (name: string, value: string, elementPath: string, context: ListContext | undefined): DocumentTreeNode {
  const path = `${elementPath}/@${name}`

  return { id: path, label: `@${name}`, valueType: 'string', xpath: path, preview: previewOf(value), ...listFields(path, context), children: [] }
}

function elementAttributes (element: Element): Record<string, string> {
  return Object.fromEntries([...element.attributes].filter(attribute => attribute.prefix !== 'xmlns' && attribute.name !== 'xmlns').map(attribute => [attribute.name, attribute.value]))
}

function elementSiblingIndex (element: Element): number {
  let index = 1
  let sibling = element.previousSibling
  while (sibling !== null) {
    if (sibling.nodeType === 1 && (sibling as Element).tagName === element.tagName) index += 1
    sibling = sibling.previousSibling
  }

  return index
}

function elementSiblingCount (element: Element): number {
  const parent = element.parentNode
  if (parent === null) return 1

  return [...parent.childNodes].filter((node): node is Element => node.nodeType === 1 && (node as Element).tagName === element.tagName).length
}

function textOf (element: Element): string | undefined {
  const text = (element.textContent ?? '').trim().replaceAll(/\s+/g, ' ')

  return text === '' ? undefined : previewOf(text)
}
