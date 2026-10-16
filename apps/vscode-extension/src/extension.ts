import * as vscode from 'vscode'
import { LearnTree } from './learn-studio'
import { AgentTree, copyMcpConfiguration, mcpScript, registerOpenCrawMcp } from './mcp-setup'
import { createStudioRunner } from './open-on-opencraw'
import { RecipeTree, createRecipeIndex, groupByOutput } from './recipe-explorer'
import type { RecipeGroup, RecipeNode } from './recipe-explorer'
import { createRecipeRunner } from './recipe-run'

/** What the extension hands to code that activates it: other extensions, and the editor end-to-end test. */
export interface OpenCrawApi {
  /** Fires with each link about to be opened in the browser. */
  onDidResolveLink: vscode.Event<string>
  /** The recipes the recipes view lists now, grouped by the output they fill. */
  recipeGroups:     () => Promise<RecipeGroup[]>
  /** The MCP server program this installation carries, for the editor end-to-end test to start. */
  mcpServerScript:  () => string
}

/** The extension's id in the editor, for the walkthrough's address. */
const WALKTHROUGH = 'opencraw.opencraw#opencraw.getStarted'

/** The hooks module the person named in their user settings; `undefined` when none (a relative or empty setting is left to the Studio side to report). */
function hooksSetting (): string | undefined {
  const named = vscode.workspace.getConfiguration('opencraw').get<string>('hooksFile', '').trim()

  return named === '' ? undefined : named
}

/** The file a recipes-view row opens in Studio: an input's own file, an output group's output recipe. */
function fileOf (node: RecipeNode): string | undefined {
  return node.type === 'input' ? node.header.file : node.group.outputFile
}

/** The extension's entry point, as the editor requires it. */
export function activate (context: vscode.ExtensionContext): OpenCrawApi {
  const runner = createStudioRunner(context.extensionPath)
  const output = vscode.window.createOutputChannel('OpenCraw')
  const index = createRecipeIndex()
  const recipes = new RecipeTree(index)
  const recipeRunner = createRecipeRunner({ extensionPath: context.extensionPath, output, hooksFile: hooksSetting })
  const mcp = registerOpenCrawMcp(context.extensionPath, ((context.extension.packageJSON as { version?: string }).version ?? '0'), hooksSetting)
  context.subscriptions.push(
    output,
    index,
    recipes,
    vscode.window.createTreeView('opencraw.recipes', { treeDataProvider: recipes, showCollapseAll: true }),
    vscode.window.createTreeView('opencraw.learn', { treeDataProvider: new LearnTree() }),
    vscode.window.createTreeView('opencraw.agent', { treeDataProvider: new AgentTree() }),
    mcp.registration,
    vscode.commands.registerCommand('opencraw.openStudio', async () => { await runner.open() }),
    vscode.commands.registerCommand('opencraw.openOn', async (uri?: vscode.Uri) => { await runner.open(uri) }),
    vscode.commands.registerCommand('opencraw.runRecipe', async (node?: RecipeNode) => { if (node !== undefined) await recipeRunner.run(node) }),
    vscode.commands.registerCommand('opencraw.openRecipeInStudio', async (node?: RecipeNode) => {
      const file = node === undefined ? undefined : fileOf(node)
      if (file !== undefined) await runner.open(vscode.Uri.file(file))
    }),
    vscode.commands.registerCommand('opencraw.copyMcpConfig', async () => { await copyMcpConfiguration(context.extensionPath, hooksSetting) }),
    vscode.commands.registerCommand('opencraw.refreshRecipes', () => { recipes.refresh() }),
    vscode.commands.registerCommand('opencraw.showWalkthrough', async () => { await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH, false) }),
    vscode.commands.registerCommand('opencraw.openLink', async (url?: string) => { if (url !== undefined) await vscode.env.openExternal(vscode.Uri.parse(url)) }),
    // The hooks file is read when the server starts: a changed setting takes effect from the next open.
    vscode.workspace.onDidChangeConfiguration(change => {
      if (!change.affectsConfiguration('opencraw.hooksFile')) {
        return
      }

      runner.restart()
      mcp.changed()
    }),
    { dispose: () => { runner.dispose() } },
  )
  void showWalkthroughOnFirstRun(context)

  return { onDidResolveLink: runner.onDidResolveLink, recipeGroups: async () => groupByOutput(await index.headers()), mcpServerScript: () => mcpScript(context.extensionPath) }
}

/** The first time the extension runs on a machine, the Get Started page opens once: a person who has never seen it learns what it does. */
async function showWalkthroughOnFirstRun (context: vscode.ExtensionContext): Promise<void> {
  const KEY = 'opencraw.walkthroughShown'
  if (context.globalState.get<boolean>(KEY) === true) return
  await context.globalState.update(KEY, true)
  if (context.extensionMode === vscode.ExtensionMode.Production) await vscode.commands.executeCommand('opencraw.showWalkthrough')
}

export function deactivate (): void {}
