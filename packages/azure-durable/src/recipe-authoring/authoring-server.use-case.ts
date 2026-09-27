import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { AuthoringContext } from './authoring-tools.use-case'
import { getRecipes, listRecipes, probe, publish, run, status, validate } from './authoring-tools.use-case'

const SERVER_INFO = { name: 'opencraw-host', version: '0.0.1' }
const recipeObjects = z.array(z.record(z.string(), z.unknown())).min(1)
const stored = z.object({ name: z.string(), version: z.string() })

/**
 * The authoring MCP server for one call: the tools an agent writes recipes
 * with, run where the recipes will run, for this caller only. Unlike the
 * local `@opencraw/mcp`, nothing takes a path: recipes travel inline, and a
 * finished set is published to the host's store.
 *
 * @param context - The host, the caller, Durable.
 * @returns The server, ready to `connect`.
 */
export function createAuthoringServer (context: AuthoringContext): McpServer {
  const server = new McpServer(SERVER_INFO)
  server.registerTool('probe', {
    description: 'Fetch a page from the crawl host (its IP, its proxies) and report where its data lives: JSON-LD, inline JSON, .json URLs, API-looking links, tables, and for files their rows and headers. Only the hosts this caller may reach.',
    inputSchema: {
      url:     z.string().describe('The page to fetch and inspect.'),
      browser: z.boolean().optional().describe('Also render the page and list the JSON responses it fetches while settling. Slower.'),
      access:  z.string().optional().describe('An access profile (a proxy) the host has.'),
    },
  }, async args => await probe(context, args))
  server.registerTool('validate', {
    description: 'Load and bind recipes passed inline (an output recipe plus its input recipes): every problem with its JSON path.',
    inputSchema: { recipes: z.union([z.string(), recipeObjects]).describe('The recipes: an array of recipe objects, or JSON / JSON Lines text.') },
  }, async args => await validate(args))
  server.registerTool('run', {
    description: 'Run recipes on the crawl host. By default a sample: a few records per input recipe, returned inline, within a tool call\'s time. With full: true, a complete crawl in the background; poll status with the instance id it returns.',
    inputSchema: {
      recipes: recipeObjects.optional().describe('The recipes inline. Give this or "recipe".'),
      recipe:  stored.optional().describe('A stored set (drafts included). Give this or "recipes".'),
      full:    z.boolean().optional().describe('Run everything, in the background.'),
    },
  }, async args => await run(context, args))
  server.registerTool('status', {
    description: 'The state of a full run: runtimeStatus, progress, and when completed the reports, records and result links.',
    inputSchema: { instanceId: z.string() },
  }, async args => await status(context, args))
  server.registerTool('list_recipes', { description: 'The recipe sets the host stores: names, versions, draft or promoted.' }, async () => await listRecipes(context))
  server.registerTool('get_recipes', {
    description: 'A stored set\'s recipes (drafts included): where to start a new version from.',
    inputSchema: { name: z.string(), version: z.string() },
  }, async args => await getRecipes(context, args))
  server.registerTool('publish', {
    description: 'Save recipes that load as a new version of a named set, as a draft. Production refuses drafts until a person promotes them. A version, once published, never changes: publish the next one instead.',
    inputSchema: { name: z.string(), version: z.string(), recipes: recipeObjects },
  }, async args => await publish(context, args))

  return server
}
