import { z } from 'zod'

/** One row of the document tree — mirrors `document-view/tree-view.mapper.ts`'s `DocumentTreeNode`, the wire shape for the UI (studio plan §3.4, issue #94's 5a). */
export interface DocumentTreeNodeView {
  id:          string
  label:       string
  valueType:   'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'element'
  preview?:    string
  jsonpath?:   string
  xpath?:      string
  listPath?:   string
  listCount?:  number
  attributes?: Record<string, string>
  children:    DocumentTreeNodeView[]
}

export const documentTreeNodeViewSchema: z.ZodType<DocumentTreeNodeView> = z.lazy(() => z.object({
  id:         z.string(),
  label:      z.string(),
  valueType:  z.enum(['object', 'array', 'string', 'number', 'boolean', 'null', 'element']),
  preview:    z.string().optional(),
  jsonpath:   z.string().optional(),
  xpath:      z.string().optional(),
  listPath:   z.string().optional(),
  listCount:  z.number().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  children:   z.array(documentTreeNodeViewSchema),
}))

/** What `document-tree` answers with (studio plan §3.4, issue #94's 5a): the parsed JSON/XML document as a tree, and, for XML, the namespace prefixes a pick's `extract` can use in `namespaces`. */
export const documentTreeViewSchema = z.object({
  format:     z.enum(['json', 'xml']),
  root:       documentTreeNodeViewSchema,
  namespaces: z.record(z.string(), z.string()).optional(),
})

export type DocumentTreeView = z.infer<typeof documentTreeViewSchema>
