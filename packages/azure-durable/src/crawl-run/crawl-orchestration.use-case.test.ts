import { defineActivity, defineOrchestration } from '@mnci/az-durable'
import { runWorkflow } from '@mnci/az-durable/testing'
import type { RecipeReport } from '@opencraw/core'
import { crawlOrchestrator } from './crawl-orchestration.use-case'
import type { RecipeTask, RecipeTaskResult } from './crawl-job.model'

const report = (recipeId: string, emitted: number): RecipeReport => ({ recipeId, mode: 'api', emitted, rejected: 0, duplicates: 0, skipped: 0, stepsSkipped: 0, pages: 1, durationMs: 1 })
const runRecipe = defineActivity('TestRunRecipe', async (task: RecipeTask): Promise<RecipeTaskResult> => ({ reports: [report((task.input as { id: string }).id, 1)] }))
const crawl = defineOrchestration('TestCrawl', crawlOrchestrator(runRecipe))

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
})
