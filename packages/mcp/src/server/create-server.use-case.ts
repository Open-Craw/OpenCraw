import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { diffInputShape, diffTool } from '../diff-tool'
import { docsInputShape, docsRoot, docsTool } from '../docs-tool'
import { listRecipesInputShape, listRecipesTool } from '../list-tool'
import { probeInputShape, probeTool } from '../probe-tool'
import { runInputShape, runTool } from '../run-tool'
import { studioOpenRecipeInputShape, studioOpenRecipeTool, studioPickInputShape, studioPickTool, studioRunSampleInputShape, studioRunSampleTool, studioStatusInputShape, studioStatusTool } from '../studio-tool'
import { validateInputShape, validateTool } from '../validate-tool'

const SERVER_INFO = { name: 'opencraw', version: '0.0.1' }

/**
 * Builds the MCP server: one tool per crawl primitive (`probe`, `validate`,
 * `run`, `list_recipes`, `diff`), `docs` and the `studio_` tools that drive a running Studio, each a thin wrapper over `@opencraw/core` and
 * `@opencraw/cli`'s structured helpers. No transport is attached; `main`
 * connects it over stdio.
 *
 * @returns The server, ready to `connect`.
 */
export function createServer (): McpServer {
  const server = new McpServer(SERVER_INFO)

  server.registerTool(
    'probe',
    { description: 'Fetch a page and report where its data lives: JSON-LD blocks, inline JSON objects, .json URLs, script hosts, API-looking links. Use before writing an input recipe, to see the shape a site\'s data actually takes.', inputSchema: probeInputShape },
    args => probeTool(args),
  )
  server.registerTool(
    'validate',
    { description: 'Load and bind recipes (an output recipe plus its input recipes), from files or passed inline: parse each against its schema, check every mapping resolves, report every problem with its JSON path.', inputSchema: validateInputShape },
    args => validateTool(args),
  )
  server.registerTool(
    'run',
    { description: 'Crawl the recipes at the given paths, or passed inline as "recipes". Use dryRun to check a recipe under construction (one record per input, returned inline); use "out" for anything beyond a handful of records.', inputSchema: runInputShape },
    args => runTool(args),
  )
  server.registerTool(
    'list_recipes',
    { description: 'List the recipe files in a directory, split by kind, with their ids. Check before writing a new recipe, or to see what an existing output recipe covers.', inputSchema: listRecipesInputShape },
    args => listRecipesTool(args),
  )

  server.registerTool(
    'diff',
    { description: 'Compare two runs\' JSON Lines files by record key: what was added, removed, and changed (each field before and after). Use to report what changed in a source since the last crawl.', inputSchema: diffInputShape },
    args => diffTool(args),
  )

  server.registerTool(
    'docs',
    { description: 'OpenCraw\'s own documentation: the authoring guide (every step, selector, transform and policy), how it works, the examples and the Studio manual. Without a topic it lists the documents; with one it gives the document, or just a section of it. Read the guide before writing a recipe you are not sure of, instead of guessing.', inputSchema: docsInputShape },
    args => docsTool(args, docsRoot()),
  )

  server.registerTool(
    'studio_status',
    { description: 'Whether OpenCraw Studio is running on this machine, which folder it has open, how many pages are watching and which recipe it is sampling. Call it before the other studio_ tools.', inputSchema: studioStatusInputShape },
    () => studioStatusTool(),
  )
  server.registerTool(
    'studio_open_recipe',
    { description: 'Open a recipe, a folder of recipes or a document in the Studio the person has open, so they watch the recipe being built. Does nothing to the files.', inputSchema: studioOpenRecipeInputShape },
    args => studioOpenRecipeTool(args),
  )
  server.registerTool(
    'studio_pick',
    { description: 'Pick a value on the web page of an input recipe in Studio, as a click would: give a CSS selector or the text the element shows. The person sees it selected and the ways to reach it; with add it is added to the recipe. Returns the selector chosen and the alternatives, with how many elements each matches. Open the recipe first with studio_open_recipe.', inputSchema: studioPickInputShape },
    args => studioPickTool(args),
  )
  server.registerTool(
    'studio_run_sample',
    { description: 'Run an input recipe as a sample in Studio (the person sees the records arrive) and get back the counts, the first records and what was rejected. Studio must have the folder of that recipe open: call studio_open_recipe first.', inputSchema: studioRunSampleInputShape },
    args => studioRunSampleTool(args),
  )

  return server
}
