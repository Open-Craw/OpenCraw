// Writes the JSON Schema for both recipe kinds and access config files and the callout request, response, resolution and captcha payloads into schemas/, from the BUILT
// library (dist/), so the files can never disagree with the published contracts.
// Run through `nx run core:schemas`, which builds first.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { accessConfigJsonSchema, calloutJsonSchemas, captchaCalloutJsonSchemas, inputRecipeJsonSchema, outputRecipeJsonSchema } = await import(pathToFileURL(join(here, '..', 'dist', 'index.esm.js')).href)

const target = join(here, '..', 'schemas')
mkdirSync(target, { recursive: true })
const callout = calloutJsonSchemas()
const captcha = captchaCalloutJsonSchemas()
for (const [name, schema] of [['input-recipe', inputRecipeJsonSchema()], ['output-recipe', outputRecipeJsonSchema()], ['access-config', accessConfigJsonSchema()], ['callout-request', callout.request], ['callout-response', callout.response], ['callout-resolution', callout.resolution], ['callout-captcha-input', captcha.input], ['callout-captcha-output', captcha.output]]) {
  const path = join(target, `${name}.schema.json`)
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`)
  console.log(`wrote ${path}`)
}
