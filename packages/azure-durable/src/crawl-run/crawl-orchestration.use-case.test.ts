import { defineActivity, defineOrchestration } from '@mnci/az-durable'
import { runWorkflow } from '@mnci/az-durable/testing'
import type { RecipeReport } from '@opencraw/core'
import { crawlOrchestrator } from './crawl-orchestration.use-case'
import type { RecipeTask, RecipeTaskResult } from './crawl-job.model'

const report = (recipeId: string, emitted: number): RecipeReport => ({ recipeId, mode: 'api', emitted, rejected: 0, duplicates: 0, skipped: 0, stepsSkipped: 0, pages: 1, durationMs: 1 })
const runRecipe = defineActivity('TestRunRecipe', async (task: RecipeTask): Promise<RecipeTaskResult> => ({ reports: [report((task.input as { id: string }).id, 1)] }))
const crawl = defineOrchestration('TestCrawl', crawlOrchestrator(runRecipe))

const parkedOnce = (resolutionsSeen: unknown[]) => (input: unknown) => {
  const task = input as RecipeTask
  resolutionsSeen.push(task.resolutions)
  if (task.resolutions === undefined) return { reports: [], parked: [{ handler: 'POST https://svc/price', idempotencyKey: 'k1' }] }

  return { reports: [report('a', 3)], records: [{ price: 9 }] }
}

describe('crawlOrchestrator', () => {
  it('runs one activity per input recipe and gathers their reports, records and links in the order given', () => {
    const run = runWorkflow(crawl, { allowedHosts: ['example.com'], output: { kind: 'output' }, inputs: [{ id: 'a' }, { id: 'b' }], dedupe: 'off' }, {
      instanceId: 'job-1',
      activities: {
        TestRunRecipe: (input) => {
          const task = input as RecipeTask
          const id = (task.input as { id: string }).id

          return id === 'a' ? { reports: [report('a', 2)], records: [{ key: 'a1' }, { key: 'a2' }] } : { reports: [report('b', 5)], resultUrl: `https://store/${task.resultName}` }
        },
      },
    })
    expect(run.calls.map(call => (call.input as RecipeTask).resultName)).toEqual(['job-1/0.jsonl', 'job-1/1.jsonl'])
    expect(run.calls.every(call => (call.input as RecipeTask).dedupe === 'off' && (call.input as RecipeTask).allowedHosts[0] === 'example.com')).toBe(true)
    expect(run.result.recipes.map(entry => entry.recipeId)).toEqual(['a', 'b'])
    expect(run.result.records).toHaveLength(2)
    expect(run.result.results).toEqual(['https://store/job-1/1.jsonl'])
  })

  describe('with calls that wait for a result to be posted back', () => {
    const job = { allowedHosts: ['example.com'], output: { kind: 'output' }, inputs: [{ id: 'a' }], callbackBase: 'https://app/api' }
    it('waits for the call, then runs the recipe again with the result it was given', () => {
      const seen: unknown[] = []
      const run = runWorkflow(crawl, job, {
        instanceId: 'job-2',
        activities: {
          'TestRunRecipe':         parkedOnce(seen),
          'opencraw-callout:0:k1': () => ({ status: 'ok', output: 9 }),
        },
      })

      expect(seen).toEqual([undefined, { k1: { status: 'ok', output: 9 } }])
      expect(run.calls.map(call => call.name)).toEqual(['TestRunRecipe', 'opencraw-callout:0:k1', '__timer', 'TestRunRecipe'])
      expect((run.calls[0]?.input as RecipeTask).callbackBase).toBe('https://app/api')
      expect((run.calls[0]?.input as RecipeTask).instanceId).toBe('job-2')
      expect(run.result.records).toEqual([{ price: 9 }])
      expect(run.result.recipes.map(entry => entry.recipeId)).toEqual(['a'])
    })

    it('fails the recipe, not the job, when nothing is posted back before the wait is over', () => {
      const waiting = defineOrchestration('TestCrawlWait', crawlOrchestrator(runRecipe, { waitMs: 5000 }))
      const run = runWorkflow(waiting, job, {
        activities: { TestRunRecipe: parkedOnce([]) },
        raceWinner: candidates => candidates.find(name => name === '__timer'),
      })

      expect(run.result.recipes).toHaveLength(1)
      expect(run.result.recipes[0]).toMatchObject({ recipeId: 'a', emitted: 0 })
      expect(run.result.recipes[0]?.error).toMatch(/no result was posted back within 5000 ms by POST https:\/\/svc\/price/)
    })

    it('stops resuming a recipe whose calls keep parking under new keys', () => {
      let runs = 0
      const run = runWorkflow(crawl, job, {
        activities: {
          TestRunRecipe: () => {
            runs += 1

            return { reports: [], parked: [{ handler: 'svc', idempotencyKey: `k${String(runs)}` }] }
          },
          // Every event arrives at once, so each run parks again straight away.
          ...Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`opencraw-callout:0:k${String(index + 1)}`, () => ({ status: 'ok', output: index })])),
        },
      })

      expect(runs).toBe(26)
      expect(run.result.recipes[0]?.error).toMatch(/after 25 runs/)
    })
  })
})
