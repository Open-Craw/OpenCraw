import * as vscode from 'vscode'
import { groupByOutput } from './group-by-output.algorithm'
import type { RecipeIndex } from './find-recipes.client'
import type { RecipeGroup } from './recipe-header.contract'
import type { RecipeNode } from './recipe-node.contract'

/** What a group row says after its name: how many inputs feed it, or what is missing. */
function groupDescription (group: RecipeGroup): string {
  if (group.outputFile === undefined) return 'no output recipe with this id'
  if (group.inputs.length === 0) return 'no input recipe feeds it yet'

  return `${String(group.inputs.length)} input${group.inputs.length === 1 ? '' : 's'}`
}

/**
 * The recipes view: each output recipe with the input recipes that feed it under it. Running a group runs every input; running an input runs just that one.
 * The context values tell `package.json` which inline buttons a row gets.
 */
export class RecipeTree implements vscode.TreeDataProvider<RecipeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<RecipeNode | undefined>()
  private readonly subscription: vscode.Disposable
  readonly onDidChangeTreeData = this.changed.event

  constructor (private readonly index: RecipeIndex) {
    this.subscription = index.onDidChange(() => { this.refresh() })
  }

  refresh (): void {
    this.changed.fire(undefined)
  }

  async getChildren (node?: RecipeNode): Promise<RecipeNode[]> {
    if (node?.type === 'input') return []
    if (node?.type === 'group') return node.group.inputs.map(header => ({ type: 'input', header, group: node.group }))

    return groupByOutput(await this.index.headers()).map(group => ({ type: 'group', group }))
  }

  getTreeItem (node: RecipeNode): vscode.TreeItem {
    if (node.type === 'input') {
      const item = new vscode.TreeItem(node.header.id, vscode.TreeItemCollapsibleState.None)
      item.iconPath = new vscode.ThemeIcon('file-code')
      item.resourceUri = vscode.Uri.file(node.header.file)
      item.tooltip = node.header.file
      item.contextValue = node.group.outputFile === undefined ? 'opencraw.input.orphan' : 'opencraw.input'
      item.command = { command: 'vscode.open', title: 'Open the recipe', arguments: [vscode.Uri.file(node.header.file)] }

      return item
    }
    const { group } = node
    const item = new vscode.TreeItem(group.outputId, vscode.TreeItemCollapsibleState.Expanded)
    item.description = groupDescription(group)
    item.iconPath = new vscode.ThemeIcon(group.outputFile === undefined ? 'warning' : 'symbol-interface')
    item.tooltip = group.outputFile ?? `No output recipe with the id "${group.outputId}" in this workspace`
    // The context value says which buttons the row gets (`package.json`): Run needs an output recipe and at least one input; a group with no output recipe has nothing to open.
    item.contextValue = group.outputFile === undefined ? 'opencraw.output.missing' : (group.inputs.length > 0 ? 'opencraw.output.runnable' : 'opencraw.output')
    if (group.outputFile !== undefined) item.command = { command: 'vscode.open', title: 'Open the output recipe', arguments: [vscode.Uri.file(group.outputFile)] }

    return item
  }

  dispose (): void {
    this.subscription.dispose()
    this.changed.dispose()
  }
}
