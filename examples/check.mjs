// Loads and binds every example's recipes, fetching nothing: a recipe an engine change breaks fails here, on
// every pull request, instead of the next time someone runs the example. Run from the repository root after
// building @opencraw/core: `npm run examples:check`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRecipeSet } from '@opencraw/core'

const here = dirname(fileURLToPath(import.meta.url))
const examples = readdirSync(here).filter(name => statSync(join(here, name)).isDirectory() && !name.startsWith('.') && name !== 'node_modules')
let failed = 0
let sets = 0

for (const example of examples) {
  const folder = join(here, example)
  const recipes = readdirSync(folder)
    .filter(file => file.endsWith('.json') && file !== 'package.json')
    .map(file => ({ path: join(folder, file), recipe: JSON.parse(readFileSync(join(folder, file), 'utf8')) }))
  const outputs = recipes.filter(({ recipe }) => recipe.kind === 'output')
  if (outputs.length === 0) {
    console.error(`✖ ${example}: no output recipe`)
    failed += 1
    continue
  }
  for (const output of outputs) {
    const inputs = recipes.filter(({ recipe }) => recipe.kind === 'input' && recipe.output === output.recipe.id).map(({ path }) => path)
    try {
      const set = await loadRecipeSet({ output: output.path, inputs })
      if (set.inputs.length === 0) throw new Error(`no input recipe feeds "${output.recipe.id}"`)
      console.log(`✓ ${example}: ${set.inputs.map(input => input.id).join(', ')} → ${output.recipe.id}`)
      sets += 1
    } catch (error) {
      console.error(`✖ ${example}: ${relative(here, output.path)}\n  ${String(error.message ?? error).replaceAll('\n', '\n  ')}`)
      failed += 1
    }
  }
}

console.log(`\n${sets} recipe sets load and bind${failed === 0 ? '' : `; ${failed} failed`}.`)
if (failed > 0) process.exitCode = 1
