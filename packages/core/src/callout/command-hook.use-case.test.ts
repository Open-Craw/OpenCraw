import type { HookContext } from '../hooks'
import { calloutRequestSchema } from './callout.contract'
import { CalloutError } from './callout.error'
import { commandHook } from './command-hook.use-case'

const logs: string[] = []
const context: HookContext = { recipeId: 'books', scope: { price: 5 }, log: (_level, message) => { logs.push(message) } }

/** A hook backed by a node script, standing in for a program in any other language. */
function nodeHook (script: string, options: { timeoutMs?: number, maxOutputBytes?: number } = {}) {
  return commandHook('slug', [process.execPath, '-e', script], options)
}

const READ_STDIN = "let text = ''; process.stdin.on('data', c => { text += c }); process.stdin.on('end', () => {"

describe('commandHook', () => {
  beforeEach(() => { logs.length = 0 })

  it('sends the request on stdin and returns the output of an ok answer', async () => {
    const hook = nodeHook(`${READ_STDIN} const request = JSON.parse(text); process.stdout.write(JSON.stringify({ status: 'ok', output: String(request.input).toUpperCase() })) })`)

    expect(await hook('hello', {}, context)).toBe('HELLO')
  })

  it('sends a request that matches the published schema, with the recipe, the scope and a stable idempotency key', async () => {
    const hook = nodeHook(`${READ_STDIN} process.stdout.write(JSON.stringify({ status: 'ok', output: JSON.parse(text) })) })`)

    const first = await hook('a', { n: 1 }, context)
    const second = await hook('a', { n: 1 }, context) as { idempotencyKey: string }

    expect(calloutRequestSchema.parse(first)).toMatchObject({ kind: 'hook', name: 'slug', input: 'a', args: { n: 1 }, context: { recipeId: 'books', scope: { price: 5 } } })
    expect(second.idempotencyKey).toBe((first as { idempotencyKey: string }).idempotencyKey)
  })

  it('leaves input out of the request for a hook step', async () => {
    const hook = nodeHook(`${READ_STDIN} process.stdout.write(JSON.stringify({ status: 'ok', output: 'input' in JSON.parse(text) })) })`)

    expect(await hook(undefined, {}, context)).toBe(false)
  })

  it('throws the reason of an error answer', async () => {
    const hook = nodeHook("process.stdout.write(JSON.stringify({ status: 'error', error: 'no such price' }))")

    await expect(hook(1, {}, context)).rejects.toThrow(/no such price/)
    await expect(hook(1, {}, context)).rejects.toBeInstanceOf(CalloutError)
  })

  it('names the exit code and the end of stderr when the program fails, and logs stderr lines', async () => {
    const hook = nodeHook("console.error('first'); console.error('boom'); process.exit(3)")

    await expect(hook(1, {}, context)).rejects.toThrow(/exited with code 3: first\nboom/)
    expect(logs).toEqual(['first', 'boom'])
  })

  it('refuses output that is not JSON', async () => {
    const hook = nodeHook("process.stdout.write('hello')")

    await expect(hook(1, {}, context)).rejects.toThrow(/the answer is not JSON: hello/)
  })

  it('refuses an answer that is not a callout response', async () => {
    const hook = nodeHook('process.stdout.write(JSON.stringify({ result: 1 }))')

    await expect(hook(1, {}, context)).rejects.toThrow(/not a callout response/)
  })

  it('kills a program that does not answer in time', async () => {
    const hook = nodeHook('setTimeout(() => undefined, 60000)', { timeoutMs: 200 })

    await expect(hook(1, {}, context)).rejects.toThrow(/no answer within 200 ms/)
  })

  it('stops at the output limit', async () => {
    const hook = nodeHook("process.stdout.write('x'.repeat(5000))", { maxOutputBytes: 100 })

    await expect(hook(1, {}, context)).rejects.toThrow(/more than 100 bytes of output/)
  })

  it('reports a program that cannot be started', async () => {
    const hook = commandHook('slug', ['opencraw-no-such-program'])

    await expect(hook(1, {}, context)).rejects.toThrow(/ENOENT/)
  })

  it('does not pass the request through a shell', async () => {
    const hook = nodeHook(`${READ_STDIN} process.stdout.write(JSON.stringify({ status: 'ok', output: JSON.parse(text).input })) })`)

    expect(await hook('$(echo pwned); `id` && x', {}, context)).toBe('$(echo pwned); `id` && x')
  })
})
