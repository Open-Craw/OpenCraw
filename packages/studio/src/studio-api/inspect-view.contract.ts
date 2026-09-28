import { z } from 'zod'

/** One row of the Inspect panel's DOM tree — mirrors `page-inspector/dom-tree.mapper.ts`'s `DomTreeNode`, the wire shape for the UI (issue #93). */
export interface DomTreeNodeView {
  nodeId:         string
  tag:            string
  id?:            string
  classes?:       string[]
  attributes:     Record<string, string>
  text?:          string
  hidden:         boolean
  children:       DomTreeNodeView[]
  repeatCount?:   number
  repeatNodeIds?: string[]
}

export const domTreeNodeViewSchema: z.ZodType<DomTreeNodeView> = z.lazy(() => z.object({
  nodeId:        z.string(),
  tag:           z.string(),
  id:            z.string().optional(),
  classes:       z.array(z.string()).optional(),
  attributes:    z.record(z.string(), z.string()),
  text:          z.string().optional(),
  hidden:        z.boolean(),
  children:      z.array(domTreeNodeViewSchema),
  repeatCount:   z.number().int().optional(),
  repeatNodeIds: z.array(z.string()).optional(),
}))

const pageDataKindSchema = z.enum(['ld-json', 'json-script', 'inline-state', 'meta', 'link'])

/** One "data in the page" entry — mirrors `page-inspector/page-data.algorithm.ts`'s `PageDataFinding`. */
export const pageDataFindingSchema = z.object({
  kind:         pageDataKindSchema,
  label:        z.string(),
  selector:     z.string(),
  selectorKind: z.literal('css'),
  matches:      z.number(),
  keys:         z.array(z.string()).optional(),
  attribute:    z.string().optional(),
})

export type PageDataKind = z.infer<typeof pageDataKindSchema>
export type PageDataFindingView = z.infer<typeof pageDataFindingSchema>

/** What `inspect-page` answers with (studio plan §3.3, issue #93): the DOM tree and the data-in-the-page findings, in one round trip — both come from the same cached snapshot/raw capture, so there is no reason to ask twice. */
export const inspectViewSchema = z.object({
  tree:     domTreeNodeViewSchema,
  pageData: z.array(pageDataFindingSchema),
})

export type InspectView = z.infer<typeof inspectViewSchema>
