import { z } from 'zod'

/** What `fetch-start-page` answers with. */
export const startPageViewSchema = z.object({
  html: z.string(),
})

export type StartPageView = z.infer<typeof startPageViewSchema>
