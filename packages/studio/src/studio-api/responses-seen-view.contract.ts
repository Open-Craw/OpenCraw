import { z } from 'zod'

/** One JSON response seen — mirrors `page-inspector/responses-seen.use-case.ts`'s `ObservedResponse`. */
export const observedResponseSchema = z.object({
  url:    z.string(),
  status: z.number(),
  size:   z.number(),
  shape:  z.string(),
})

export type ObservedResponseView = z.infer<typeof observedResponseSchema>

/** What `responses-seen` answers with (studio plan §3.3, issue #93): the JSON responses the page fetched while it rendered, for the panel's "responses seen" list. */
export const responsesSeenViewSchema = z.object({
  responses: z.array(observedResponseSchema),
})

export type ResponsesSeenView = z.infer<typeof responsesSeenViewSchema>
