import { CaptchaError } from '../captcha'
import { HttpError } from '../http-session'
import { MappingFailedError } from '../output-mapping'
import { BlockedError, NoMatchError, StepFailure, transientError } from '../step-flow'

/**
 * Why a recipe run stopped, in the terms a worker pool acts on:
 * - `captcha`: a challenge the solver could not get past;
 * - `blocked`: the site's block rule matched;
 * - `browser`: the page, context or browser closed under the run;
 * - `http`: an answer with an error status, after the retries;
 * - `timeout`, `network`: the site too slow, or the connection failing, after the retries;
 * - `step`: a step failed on the page itself (a selector that matched nothing, a script that threw);
 * - `mapping`: a record could not be mapped at all;
 * - `error`: anything else.
 */
export type ErrorKind = 'captcha' | 'blocked' | 'browser' | 'http' | 'timeout' | 'network' | 'step' | 'mapping' | 'error'

const CLOSED = /target (?:page, context or browser )?(?:has been )?closed|browser has been closed|browser has disconnected|context (?:has been )?closed|page (?:has been )?closed/i
const TIMEOUT = /Timeout \d+ms exceeded|net::ERR_TIMED_OUT|ETIMEDOUT/

/**
 * Classifies what stopped a run, looking through the causes a step failure wraps.
 *
 * @param error - What the run threw.
 * @returns The kind.
 */
export function errorKindOf (error: unknown): ErrorKind {
  const chain = causesOf(error)
  if (chain.some(entry => entry instanceof CaptchaError)) return 'captcha'
  if (chain.some(entry => entry instanceof BlockedError)) return 'blocked'
  const messages = chain.map(entry => (entry instanceof Error ? entry.message : String(entry)))
  if (messages.some(message => CLOSED.test(message))) return 'browser'
  if (chain.some(entry => entry instanceof HttpError)) return 'http'
  if (messages.some(message => TIMEOUT.test(message))) return 'timeout'
  if (chain.some(entry => transientError(entry) !== undefined)) return 'network'
  if (chain.some(entry => entry instanceof MappingFailedError)) return 'mapping'
  if (chain.some(entry => entry instanceof StepFailure || entry instanceof NoMatchError)) return 'step'

  return 'error'
}

function causesOf (error: unknown): unknown[] {
  const chain: unknown[] = []
  for (let current = error; current !== undefined && chain.length < 10; current = current instanceof Error ? current.cause : undefined) chain.push(current)

  return chain
}
