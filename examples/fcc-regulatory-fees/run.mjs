// npm start                   the copy of the document shipped in this folder (offline)
// npm start -- --live         the original, from the URL in the recipe
// npm start -- --trace        also print the route: steps, records
import { crawl } from './crawl.mjs'

const live = process.argv.includes('--live')
const report = await crawl({ live, trace: process.argv.includes('--trace') })
const [recipe] = report.recipes
console.log(`\n${report.records} records written to ${report.sink.location} (${live ? 'the original document' : 'the shipped copy'})`)
console.log(`  ${recipe.recipeId}: ${recipe.emitted} emitted, ${recipe.rejected} rejected, ${recipe.durationMs} ms${recipe.error === undefined ? '' : `, stopped: ${recipe.error}`}`)
if (report.records === 0 || recipe.error !== undefined) process.exitCode = 1
