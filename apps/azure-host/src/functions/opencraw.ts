import { fileURLToPath } from 'node:url'
import { registerOpenCraw } from '@opencraw/azure-durable'
import { hostOptions } from '../host-settings.js'
import { shippedRecipes } from '../shipped-recipes.js'

// The recipes ship next to the code: the build copies src/assets to dist/assets.
const recipes = fileURLToPath(new URL('../assets/recipes', import.meta.url))

// POST /api/crawl, POST /api/jobs/{crawlId}/items, GET and DELETE /api/jobs/{crawlId},
// POST /api/recipes/{name}/{version}/promote and /api/mcp.
registerOpenCraw(hostOptions(process.env, shippedRecipes(recipes)))
