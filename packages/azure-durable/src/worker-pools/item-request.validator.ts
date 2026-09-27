import { z } from 'zod'

/** Ids end up in Durable instance ids and blob names: letters, digits, `_`, `.`, `-`. */
const id = z.string().regex(/^[\w.-]{1,64}$/, 'use 1 to 64 letters, digits, "_", "." or "-"')
const count = z.number().int().positive()
const after = z.strictObject({ after: count.optional() })
const idle = z.strictObject({ afterMs: count })
const windowsPolicy = z.strictObject({
  min:     count.optional(),
  max:     count.optional(),
  start:   count.optional(),
  grow:    after.optional(),
  shrink:  z.enum(['one', 'half']).optional(),
  restart: after.optional(),
  idle:    idle.optional(),
})
const windows = z.union([count, windowsPolicy])
const varValue = z.union([z.string(), z.number(), z.boolean()])
const recipeVersion = z.strictObject({ name: z.string().min(1), version: z.string().min(1) })
const workItem = z.strictObject({ id, vars: z.record(z.string(), varValue), recipe: z.string().optional() })

export const crawlIdSchema = id

/** A `/jobs/{crawlId}/items` body. */
export const itemRequestSchema = z.strictObject({
  recipe:  recipeVersion,
  item:    workItem,
  /** How many items the job has, about: caps the windows and closes the pool once that many ended. */
  jobSize: count.optional(),
  /** The pool's windows, when this item opens it; capped by the host's `pools.maxWindows`. */
  windows: windows.optional(),
})

export type ItemRequest = z.infer<typeof itemRequestSchema>
