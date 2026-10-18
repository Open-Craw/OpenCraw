import { z } from 'zod'
import { MESSAGES, PROTOCOL_VERSION } from './driver-message.contract'

const OPTIONS = { target: 'draft-2020-12', io: 'output', unrepresentable: 'any' } as const

/**
 * The driver protocol as one JSON Schema document (`schemas/driver-protocol.schema.json`): every method's
 * params and result, every notification's params, by name under `$defs`. A client in another language
 * generates its models from it instead of typing them by hand.
 *
 * @returns A draft 2020-12 document.
 */
export function driverProtocolJsonSchema (): Record<string, unknown> {
  const defs: Record<string, unknown> = {}
  const methods: Record<string, unknown> = {}
  for (const [name, message] of Object.entries(MESSAGES)) {
    const entry: Record<string, unknown> = { direction: message.direction }
    if (message.params !== undefined) {
      defs[`${name}.params`] = z.toJSONSchema(message.params, OPTIONS)
      entry.params = { $ref: `#/$defs/${name}.params` }
    }
    if (message.result !== undefined) {
      defs[`${name}.result`] = z.toJSONSchema(message.result, OPTIONS)
      entry.result = { $ref: `#/$defs/${name}.result` }
    }
    methods[name] = entry
  }

  return {
    $schema:         'https://json-schema.org/draft/2020-12/schema',
    $id:             'https://opencraw/schemas/driver-protocol.schema.json',
    title:           'OpenCraw driver protocol',
    description:     'JSON-RPC 2.0 over stdio, one message per line. Methods with a result are requests; the rest are notifications.',
    protocolVersion: PROTOCOL_VERSION,
    methods,
    $defs:           defs,
  }
}
