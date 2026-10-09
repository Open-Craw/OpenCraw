import { z } from 'zod'
import type { CrawlJob } from './crawl-job.model'

const crawlJobSchema = z.object({
  caller:       z.string().optional(),
  allowedHosts: z.array(z.string()).min(1),
  output:       z.unknown(),
  inputs:       z.array(z.unknown()).min(1),
  dedupe:       z.enum(['recipe', 'off']).optional(),
  callbackBase: z.string().optional(),
})

/**
 * Checks a `/crawl` orchestration's input as it comes back out of the task
 * hub: an instance started before a deploy resumes against the new code.
 *
 * @param raw - The stored input.
 * @returns The job.
 * @throws ZodError when it is not one.
 */
export function parseCrawlJob (raw: unknown): CrawlJob {
  return crawlJobSchema.parse(raw)
}
