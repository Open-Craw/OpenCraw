// Scenes for page 10 of the guide, "Running". Each runs the recipes in ../../recipes/<name>/ with the
// crawler options in `crawler` (spread into createCrawler): parallel recipes, a per-site throttle, resume,
// allowedHosts. None takes screenshots: what they show is the trace.
import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsonLinesSink } from '@opencraw/core'

const recipes = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'recipes')

/**
 * A resumed run's sink: `jsonLinesSink` in append mode, over a copy of the file an earlier run left
 * (recipes/run-resume/earlier-run.jsonl), so every capture resumes from the same earlier run and the file
 * in the repository never changes.
 */
function resumedSink () {
  let sink
  const opened = async (output) => {
    const folder = await mkdtemp(join(tmpdir(), 'opencraw-resume-'))
    const copy = join(folder, 'books.jsonl')
    await copyFile(join(recipes, 'run-resume', 'earlier-run.jsonl'), copy)
    sink = jsonLinesSink(copy, { append: true })
    await sink.open(output)
  }

  return {
    open:  opened,
    write: record => sink.write(record),
    has:   key => sink.has(key),
    close: () => sink.close(),
  }
}

export const SCENES = [
  // A matrix: one recipe, two variants, run one after the other.
  { name: 'run-matrix', keep: 4 },
  // Two recipes side by side (parallel: 2) on one site, under a per-site throttle of one request a second.
  {
    name:    'run-throttle',
    keep:    6,
    crawler: { parallel: 2, throttle: { domains: { 'books.toscrape.com': { delayMs: 1000, concurrency: 1 } } } },
  },
  // forEach with limits.concurrency 3 in api mode: three requests at a time, under delayMs 300.
  { name: 'run-concurrency', keep: 6 },
  // resume against the file of an earlier run that stopped after five records.
  { name: 'run-resume', keep: 11, crawler: { resume: true, sink: resumedSink() } },
  // A bootstrap login in a browser, then an api session with its cookies; the same recipe without it.
  { name: 'run-session', keep: 2 },
  // allowedHosts: a web and an api recipe each follow a link off the list.
  { name: 'run-allowed-hosts', keep: 2, crawler: { allowedHosts: ['quotes.toscrape.com'] } },
  // A 404 in a browser under the default block rule: the page loads, the next step finds nothing.
  { name: 'run-not-found', keep: 1 },
  // The same 404 over HTTP with blockedWhen, transport retries, a rotation and a step retry.
  { name: 'run-blocked', keep: 1 },
]
