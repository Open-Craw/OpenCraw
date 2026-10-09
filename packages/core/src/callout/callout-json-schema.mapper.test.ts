import { calloutJsonSchemas } from './callout-json-schema.mapper'

describe('calloutJsonSchemas', () => {
  it('describes the request and the response for a service in any language', () => {
    const { request, response } = calloutJsonSchemas()

    expect(request.$id).toBe('https://opencraw/schemas/callout-request.schema.json')
    expect(Object.keys(request.properties as object)).toEqual(expect.arrayContaining(['kind', 'name', 'args', 'context', 'idempotencyKey']))
    expect(response.$id).toBe('https://opencraw/schemas/callout-response.schema.json')
    expect(JSON.stringify(response)).toContain('"pending"')
  })
})
