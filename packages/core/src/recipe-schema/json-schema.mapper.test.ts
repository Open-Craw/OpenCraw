import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inputRecipeJsonSchema, outputRecipeJsonSchema } from './json-schema.mapper'
import type { JsonSchemaDocument } from './json-schema.mapper'

/**
 * Every `pattern` a JSON Schema sets for `key`: `properties.<key>.pattern` on any node, or, for the
 * `propertyNames` keyword, `propertyNames.pattern`.
 */
function patternsAt (node: unknown, key: string, found = new Set<string>()): Set<string> {
  if (node === null || typeof node !== 'object') return found
  const record = node as Record<string, unknown>
  const properties = record.properties as Record<string, { pattern?: unknown } | undefined> | undefined
  const direct = key === 'propertyNames' ? record.propertyNames as { pattern?: unknown } | undefined : properties?.[key]
  if (typeof direct?.pattern === 'string') found.add(direct.pattern)
  for (const value of Object.values(record)) patternsAt(value, key, found)

  return found
}

/** A JSON Schema pattern carries no flags, so each must mean what it says compiled with none. */
function accepts (patterns: ReadonlySet<string>, name: string): boolean {
  return patterns.size > 0 && [...patterns].every(pattern => new RegExp(pattern, 'u').test(name))
}

/** A schema as `npm run core:schemas` wrote it to packages/core/schemas. */
function committed (name: string): JsonSchemaDocument {
  return JSON.parse(readFileSync(join(__dirname, '..', '..', 'schemas', `${name}.schema.json`), 'utf8')) as JsonSchemaDocument
}

const RECIPE_ID = '^[a-z0-9][a-z0-9-]*$'

describe('JSON Schema emission', () => {
  it('produces a draft 2020-12 document for each recipe kind', () => {
    for (const document of [inputRecipeJsonSchema(), outputRecipeJsonSchema()]) {
      expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
      expect(document.type).toBe('object')
      expect(typeof document.$id).toBe('string')
    }
  })

  it('names the recursive step and field schemas through $defs', () => {
    const input = JSON.stringify(inputRecipeJsonSchema())
    const output = JSON.stringify(outputRecipeJsonSchema())
    expect(input).toContain('"$ref"')
    expect(input).toContain('"forEach"')
    expect(output).toContain('"$ref"')
    expect(output).toContain('"currency"')
  })

  it('accepts lowercase field names, at the top level and inside object fields, and still refuses dots', () => {
    const names = patternsAt(outputRecipeJsonSchema(), 'propertyNames')
    expect(names.size).toBe(1)
    for (const name of ['url', 'price', 'in_stock', 'Price', 'SKU', '_raw', 'unit-price']) expect(accepts(names, name)).toBe(true)
    for (const name of ['stock.count', '1st', '']) expect(accepts(names, name)).toBe(false)
  })

  it('accepts lowercase step ids, forEach variables and var names', () => {
    const input = inputRecipeJsonSchema()
    const stepIds = new Set([...patternsAt(input, 'id')].filter(pattern => pattern !== RECIPE_ID))
    for (const patterns of [stepIds, patternsAt(input, 'as'), patternsAt(input, 'into'), patternsAt(input, 'propertyNames')]) {
      expect(accepts(patterns, 'items')).toBe(true)
      expect(accepts(patterns, 'productLinks')).toBe(true)
    }
    expect(accepts(stepIds, 'next.page')).toBe(false)
  })

  it('matches the committed schemas (run `npm run core:schemas` after a contract change)', () => {
    expect(committed('input-recipe')).toEqual(inputRecipeJsonSchema())
    expect(committed('output-recipe')).toEqual(outputRecipeJsonSchema())
  })
})
