import type { HttpRequest, HttpResponse } from '@azure/functions'
import type { DurableClient, OrchestrationContext, Task } from 'durable-functions'

/** An orchestration as `defineOrchestration` returns it: its body, callable without the Functions host. */
interface Orchestration {
  name:    string
  handler: (context: OrchestrationContext, input: never) => Generator<Task, unknown, unknown>
}

/** What the harness knows of an instance: what `getStatus` answers. */
export interface Instance {
  name:          string
  input:         unknown
  runtimeStatus: 'Running' | 'Completed' | 'Failed'
  output?:       unknown
  customStatus?: unknown
  done:          Promise<void>
}

/** A scheduled activity, or a fan-out or race over them; a timer also carries `cancel`. */
interface Scheduled {
  kind:         'activity' | 'all' | 'any'
  promise:      Promise<unknown>
  result?:      unknown
  isCompleted?: boolean
  cancel?:      () => void
}

/** What a scheduled task resolves to; for a race, the winning task, its result set as the SDK does. */
async function settle (task: Scheduled): Promise<unknown> {
  if (task.kind !== 'any') return await task.promise
  const winner = await task.promise as Scheduled
  winner.result = await winner.promise
  winner.isCompleted = true

  return winner
}

/**
 * A Durable Functions stand-in that runs orchestrations and activities in
 * this process, for tests: activities start when scheduled (so a fan-out
 * runs in parallel), `Task.all` waits for all, `Task.any` returns the first
 * to finish. External events wait until `client.raiseEvent` posts them (or
 * take one raised earlier), and timers fire after their delay unless
 * cancelled. No replay, no task hub: the orchestration code and the
 * activities are the real ones.
 *
 * @param orchestrations - The orchestrations, by name.
 * @param activities - The activity handlers, by name.
 * @returns A client for the HTTP handlers, and the instances it started.
 */
export function inProcessDurable (orchestrations: Orchestration[], activities: Record<string, (input: never) => Promise<unknown>>): { client: DurableClient, instances: Map<string, Instance>, starts: string[] } {
  const instances = new Map<string, Instance>()
  const starts: string[] = []
  let next = 0
  // Events raised before anything waited for them, and the waits that have not been answered yet.
  const queued = new Map<string, unknown[]>()
  const waiting = new Map<string, ((data: unknown) => void)[]>()
  const waitFor = (instanceId: string, name: string): Promise<unknown> => new Promise((resolve) => {
    const key = `${instanceId}|${name}`
    const early = queued.get(key)
    if (early !== undefined && early.length > 0) resolve(early.shift())
    else waiting.set(key, [...(waiting.get(key) ?? []), resolve])
  })

  const schedule = (name: string, input: unknown): Scheduled => {
    const activity = activities[name]
    if (activity === undefined) throw new Error(`no activity "${name}"`)

    return { kind: 'activity', promise: activity(input as never) }
  }
  const drive = async (orchestration: Orchestration, instanceId: string, instance: Instance): Promise<void> => {
    const context = {
      df: {
        instanceId,
        isReplaying:          false,
        currentUtcDateTime:   new Date(),
        callActivity:         schedule,
        waitForExternalEvent: (name: string): Scheduled => ({ kind: 'activity', promise: waitFor(instanceId, name) }),
        createTimer:          (fireAt: Date): Scheduled => {
          let handle: NodeJS.Timeout | undefined
          const timer: Scheduled = {
            kind:    'activity',
            promise: new Promise((resolve) => { handle = setTimeout(resolve, Math.max(0, fireAt.getTime() - Date.now())) }),
            cancel:  () => { clearTimeout(handle) },
          }

          return timer
        },
        setCustomStatus: (status: unknown) => { instance.customStatus = structuredClone(status) },
        Task:            {
          all: (tasks: Scheduled[]): Scheduled => ({ kind: 'all', promise: Promise.all(tasks.map(task => task.promise)) }),
          any: (tasks: Scheduled[]): Scheduled => ({
            kind:    'any',
            promise: Promise.race(tasks.map(async (task) => {
              await task.promise

              return task
            })),
          }),
        },
      },
    } as unknown as OrchestrationContext
    try {
      const body = orchestration.handler(context, instance.input as never)
      let step = body.next()
      while (step.done !== true) {
        let value: unknown
        let failure: unknown
        try {
          value = await settle(step.value as unknown as Scheduled)
        } catch (error) {
          failure = error ?? new Error('activity failed')
        }
        step = failure === undefined ? body.next(value) : body.throw(failure)
      }
      instance.output = step.value
      instance.runtimeStatus = 'Completed'
    } catch (error) {
      instance.output = error instanceof Error ? error.message : String(error)
      instance.runtimeStatus = 'Failed'
    }
  }

  const client = {
    startNew: async (name: string, options: { instanceId?: string, input?: unknown } = {}): Promise<string> => {
      const orchestration = orchestrations.find(entry => entry.name === name)
      if (orchestration === undefined) throw new Error(`no orchestration "${name}"`)
      next += 1
      const instanceId = options.instanceId ?? `instance-${next}`
      starts.push(instanceId)
      const instance: Instance = { name, input: options.input, runtimeStatus: 'Running', done: Promise.resolve() }
      instances.set(instanceId, instance)
      instance.done = drive(orchestration, instanceId, instance)

      return instanceId
    },
    getStatus: async (instanceId: string) => {
      const instance = instances.get(instanceId)
      if (instance === undefined) throw new Error(`DurableClient error: Durable Functions extension replied with HTTP 404 response for "${instanceId}"`)

      return { instanceId, name: instance.name, input: instance.input, runtimeStatus: instance.runtimeStatus, output: instance.output, customStatus: instance.customStatus }
    },
    raiseEvent: async (instanceId: string, name: string, data: unknown): Promise<void> => {
      const key = `${instanceId}|${name}`
      const pending = waiting.get(key)
      const resolve = pending?.shift()
      if (resolve === undefined) {
        queued.set(key, [...(queued.get(key) ?? []), data])
      } else {
        resolve(data)
      }
    },
    createCheckStatusResponse: (_request: HttpRequest | undefined, instanceId: string) => ({ status: 202, jsonBody: { id: instanceId, statusQueryGetUri: `http://host/runtime/webhooks/durabletask/instances/${instanceId}` } }) as unknown as HttpResponse,
  }

  return { client: client as unknown as DurableClient, instances, starts }
}
