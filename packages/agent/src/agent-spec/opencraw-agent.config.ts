import type { AgentSpec } from './agent-spec.contract'
import { OPENCRAW_INSTRUCTIONS } from './opencraw-instructions.config'

/**
 * The OpenCraw agent: a specialist developer who builds recipes with you. The tools are the ones `@opencraw/mcp` serves; the Studio tools are what a
 * running Studio will offer a connected chatbot.
 */
export const OPENCRAW_AGENT: AgentSpec = {
  id:          'opencraw',
  name:        'OpenCraw',
  description: 'A specialist in OpenCraw: reads web pages, APIs, PDFs, spreadsheets and other files, and builds the input and output recipes that turn them into the data (or the file) you need. Ask it for a recipe, or how to use Studio.',
  mcpServer:   'opencraw',
  tools:       [
    { name: 'probe', use: 'look at a page or a file and see where its data lives' },
    { name: 'list_recipes', use: 'see which input and output recipes already exist' },
    { name: 'docs', use: 'read the authoring guide, how it works, the examples and the Studio manual' },
    { name: 'validate', use: 'check recipes parse, bind and map every field' },
    { name: 'run', use: 'try a recipe with dryRun, then crawl for real into a file' },
    { name: 'diff', use: 'compare two runs: what was added, removed and changed' },
  ],
  studioTools: [
    { name: 'studio_status', use: 'see whether Studio is running, what it has open and what it is sampling' },
    { name: 'studio_open_recipe', use: 'open a recipe in Studio for the person' },
    { name: 'studio_pick', use: 'pick a value on the recipe page, as a click would' },
    { name: 'studio_run_sample', use: 'run a sample in Studio and look at the records' },
  ],
  instructions: OPENCRAW_INSTRUCTIONS,
}
