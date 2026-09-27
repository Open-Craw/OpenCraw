import { z } from 'zod'
import type { ItemJob } from './pool-job.model'

const varValue = z.union([z.string(), z.number(), z.boolean()])
const workItem = z.object({ id: z.string(), vars: z.record(z.string(), varValue), recipe: z.string().optional() })
const itemJobSchema = z.object({
  key:          z.string(),
  crawlId:      z.string(),
  allowedHosts: z.array(z.string()).min(1),
  recipe:       z.object({ name: z.string(), version: z.string() }),
  item:         workItem,
  jobSize:      z.number().optional(),
  windows:      z.unknown().optional(),
  resultName:   z.string(),
})

/**
 * Checks a pooled item's orchestration input as it comes back out of the task hub.
 *
 * @param raw - The stored input.
 * @returns The job.
 * @throws ZodError when it is not one.
 */
export function parseItemJob (raw: unknown): ItemJob {
  return itemJobSchema.parse(raw) as ItemJob
}
