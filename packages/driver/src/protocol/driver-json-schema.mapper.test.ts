import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { driverProtocolJsonSchema } from './driver-json-schema.mapper'
import { MESSAGES, PROTOCOL_VERSION } from './driver-message.contract'

describe('driverProtocolJsonSchema', () => {
  it('describes every method and notification, requests with a result and notifications without', () => {
    const schema = driverProtocolJsonSchema() as { protocolVersion: string, methods: Record<string, { params?: unknown, result?: unknown }>, $defs: Record<string, unknown> }
    expect(schema.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(Object.keys(schema.methods)).toEqual(Object.keys(MESSAGES))
    expect(schema.methods.run).toEqual({ direction: 'client-to-driver', params: { $ref: '#/$defs/run.params' }, result: { $ref: '#/$defs/run.result' } })
    expect(schema.methods.record).toEqual({ direction: 'driver-to-client', params: { $ref: '#/$defs/record.params' } })
    expect(schema.$defs['callout.params']).toMatchObject({ type: 'object', required: ['runId', 'request'] })
  })

  it('is what schemas/driver-protocol.schema.json holds: run `smith run schemas -p driver` after changing a contract', () => {
    const committed = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'schemas', 'driver-protocol.schema.json'), 'utf8')) as unknown
    expect(committed).toEqual(driverProtocolJsonSchema())
  })
})
