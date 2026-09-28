import type { FieldTrace } from '@opencraw/core'

/** One step of the recipe that may have bound the missing value's source id, and how it went over the whole sample run (`sample-run`'s `SampleStepSummary`). */
export interface WhyStepFact {
  path:     string
  stepType: string
  stepId?:  string
  outcome:  'ran' | 'skipped' | 'retried' | 'not-found'
  error?:   string
}

/** Everything `buildWhySentence` needs to explain one missing or rejected value; gathered by `why.use-case.ts` from the last sample run's kept trace, scope and step summary. */
export interface WhyFacts {
  field:    string
  outcome:  'missing' | 'rejected'
  /** The engine's own rejection reason (`record:reject`'s `reason`), for a rejected record. */
  reason?:  string
  /** The resolved missing-value policy (`nullable`, `default`, `null`, `fail`, `skip-record`), when the field could be found in the output recipe. */
  policy?:  string
  /** The field's mapping trace, when the record itself was emitted (a `missing` outcome only — a rejected record never reached `data`). */
  trace?:   FieldTrace
  /** The leading id the rule's `from` reads (`item` of `item.description`), when the rule could be found. */
  boundId?: string
  /** The step that binds `boundId`, when one was found in the recipe. */
  step?:    WhyStepFact
  /** A best-effort hint about what the bound value actually held (phase 2's item snapshot gives a richer one for a CSS pick; this is the scope-only fallback — see this module's doc comment). */
  hint?:    string
}

/**
 * Builds the Why? tab's sentence (studio plan §4.4, issue #92) from the
 * facts `why.use-case.ts` gathers: the value the mapping read (and each
 * transform's effect on it), the step that bound its source id and whether
 * it ran, was skipped, or bound nothing this recipe knows of, the
 * missing-value policy that applied, and a hint about what was actually
 * there instead.
 *
 * This is the scope-snapshot-only half of the design: phase 2's per-item DOM
 * snapshot (the CSS-selector "the item has `.price_new`" hint the issue's
 * example shows) is not wired in here — `sample-run` keeps the mapping's
 * scope snapshot (bound ids and their values), not a per-`forEach`-item DOM
 * capture, and building that link is a bigger integration than this phase's
 * budget covers (see this package's `page-snapshot` slice, which captures a
 * step's page for the content pane, not per-iteration). `hint`, when given,
 * is instead built from the scope snapshot itself (`item-hint.algorithm.ts`).
 *
 * @param facts - What is known about the value.
 * @returns One sentence, always ending in a period.
 */
export function buildWhySentence (facts: WhyFacts): string {
  return facts.outcome === 'rejected' ? rejectedSentence(facts) : missingSentence(facts)
}

function rejectedSentence (facts: WhyFacts): string {
  const parts = [`"${facts.field}" was rejected: ${facts.reason ?? 'the engine gave no reason'}`]
  if (facts.policy !== undefined) parts.push(` (policy: ${facts.policy})`)

  return `${parts.join('')}.`
}

function missingSentence (facts: WhyFacts): string {
  const parts = [`"${facts.field}" is missing`, stepClause(facts)]
  if (facts.policy !== undefined) parts.push(`; left ${facts.policy === 'null' ? 'null' : facts.policy} by policy`)
  if (facts.hint !== undefined) parts.push(`; ${facts.hint}`)

  return `${parts.join('')}.`
}

function stepClause (facts: WhyFacts): string {
  const boundId = facts.boundId ?? facts.field
  const step = facts.step
  if (step === undefined) return ': no step in this recipe binds its source'
  const label = step.stepId === undefined ? describeStepType(step.stepType) : `${describeStepType(step.stepType)} "${step.stepId}"`
  if (step.outcome === 'not-found') return `: no step in this recipe binds "${boundId}"`
  if (step.outcome === 'skipped') return `: ${label} (${step.path}), which binds "${boundId}", was skipped${step.error === undefined ? '' : ` (${step.error})`}`
  if (step.outcome === 'retried') return `: ${label} (${step.path}), which binds "${boundId}", had to retry${step.error === undefined ? '' : ` (${step.error})`} and still found nothing for "${facts.field}"`

  return `: ${label} (${step.path}) ran and bound "${boundId}", but "${facts.field}" reads ${sourceOf(facts)} from it, which was empty`
}

function sourceOf (facts: WhyFacts): string {
  return facts.trace?.from === undefined ? 'a path' : JSON.stringify(facts.trace.from)
}

/** A step's type read as a short phrase, matching the Steps outline's own vocabulary (studio plan §4.1: "Go to…", "Read… from…"). */
function describeStepType (stepType: string): string {
  switch (stepType) {
    case 'extract': { return 'the Read step'
    }
    case 'request': { return 'the request step'
    }
    case 'forEach': { return 'the loop'
    }
    case 'paginate': { return 'the pagination'
    }
    case 'goto': { return 'the Go to step'
    }
    default: { return `the ${stepType} step`
    }
  }
}
