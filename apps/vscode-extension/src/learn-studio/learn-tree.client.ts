import * as vscode from 'vscode'
import { LEARN_LINKS } from './learn-links.config'
import type { LearnLink } from './learn-links.config'

/** The Learn view: a short list of where to read, each opening in the browser. */
export class LearnTree implements vscode.TreeDataProvider<LearnLink> {
  getChildren (link?: LearnLink): LearnLink[] {
    return link === undefined ? [...LEARN_LINKS] : []
  }

  getTreeItem (link: LearnLink): vscode.TreeItem {
    const item = new vscode.TreeItem(link.label, vscode.TreeItemCollapsibleState.None)
    item.description = link.description
    item.tooltip = `${link.description}\n${link.url}`
    item.iconPath = new vscode.ThemeIcon(link.icon)
    item.command = { command: 'opencraw.openLink', title: 'Open', arguments: [link.url] }

    return item
  }
}
