// npm start                  both recipes: the web one (a browser) and the api one (HTTP after a browser login)
// npm start -- --only api    or --only web
// npm start -- --trace       also print the route: pages, steps, records
import { crawlShop } from './shop.mjs'

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined
const report = await crawlShop({ only, trace: process.argv.includes('--trace') })
console.log(`\n${report.records} records written to ${report.sink.location}`)
for (const recipe of report.recipes) console.log(`  ${recipe.recipeId}: ${recipe.emitted} emitted, ${recipe.duplicates} duplicates, ${recipe.rejected} rejected, ${recipe.pages} pages, ${recipe.durationMs} ms${recipe.error === undefined ? '' : `, stopped: ${recipe.error}`}`)
if (report.records === 0 || report.recipes.some(recipe => recipe.error !== undefined)) process.exitCode = 1
