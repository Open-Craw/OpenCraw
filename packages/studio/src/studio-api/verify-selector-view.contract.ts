import { z } from 'zod'

/**
 * What `verify-selector` answers with: the match count against the snapshot
 * and, when the live page could be reached, against it too (issue #91's
 * "flag a selector that matches the snapshot but not the live page").
 * `liveChecked` is `false` when the live page could not be fetched (offline,
 * blocked by `allowedHosts`, a transient error) — the card shows the
 * snapshot count alone rather than a misleading "0 on the live page".
 */
export const verifySelectorViewSchema = z.object({
  selector:        z.string(),
  snapshotMatches: z.number(),
  liveChecked:     z.boolean(),
  liveMatches:     z.number().optional(),
  liveError:       z.string().optional(),
})

export type VerifySelectorView = z.infer<typeof verifySelectorViewSchema>
