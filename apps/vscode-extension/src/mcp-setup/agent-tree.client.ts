import * as vscode from 'vscode'

/** One row of the AI agent view. */
interface AgentRow {
  label:       string
  description: string
  icon:        string
  command?:    { command: string, title: string }
}

/** What the AI agent view shows: what is ready, and the button for each thing a person may want to do next. */
const ROWS: readonly AgentRow[] = [
  { label: 'OpenCraw tools in VS Code', description: 'Ready: pick OpenCraw in agent mode\'s tools', icon: 'check' },
  { label: 'Use OpenCraw in another agent…', description: 'Copy the configuration for Claude Code, Cursor and others', icon: 'copy', command: { command: 'opencraw.copyMcpConfig', title: 'Copy MCP configuration' } },
]

/** The AI agent view: whether the MCP server is set up, and how to set it up elsewhere. */
export class AgentTree implements vscode.TreeDataProvider<AgentRow> {
  getChildren (row?: AgentRow): AgentRow[] {
    return row === undefined ? [...ROWS] : []
  }

  getTreeItem (row: AgentRow): vscode.TreeItem {
    const item = new vscode.TreeItem(row.label, vscode.TreeItemCollapsibleState.None)
    item.description = row.description
    item.tooltip = `${row.label}: ${row.description}`
    item.iconPath = new vscode.ThemeIcon(row.icon)
    if (row.command !== undefined) item.command = row.command

    return item
  }
}
