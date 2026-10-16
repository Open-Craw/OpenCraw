// Runs inside the editor's extension host (started by ../run-editor-test.mjs), against the extension as the
// editor loads it. It uses the real commands, a real Studio process and the real settings; the only thing it
// does not look at is the browser the link is handed to.
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const vscode = require('vscode')

const LINK_TIMEOUT_MS = 90_000

/** The next link the extension resolves, or a rejection saying none came. */
function nextLink (api) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(`no link within ${LINK_TIMEOUT_MS / 1000} s`)) }, LINK_TIMEOUT_MS)
    const subscription = api.onDidResolveLink(link => {
      clearTimeout(timer)
      subscription.dispose()
      resolve(link)
    })
  })
}

async function command (link, body) {
  const url = new URL(link)
  const response = await fetch(`${url.origin}/api/command`, {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-opencraw-token': url.searchParams.get('token') },
    body:    JSON.stringify(body),
  })
  assert.equal(response.status, 200, `${body.type} answered ${response.status}`)

  return await response.json()
}

/** Starts the MCP server the way the editor does (its own executable as plain Node), asks it for its tools over stdio and stops it. */
async function mcpToolNames (script) {
  const child = spawn(process.execPath, [script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'ignore'] })
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('the MCP server did not answer within 60 s')) }, 60_000)
      let buffer = ''
      child.on('error', reject)
      child.stdout.on('data', (chunk) => {
        buffer += String(chunk)
        for (const line of buffer.split('\n').slice(0, -1)) {
          const message = JSON.parse(line)
          if (message.id === 1) {
            child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
            child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`)
          }
          if (message.id === 2) {
            clearTimeout(timer)
            resolve(message.result.tools.map(tool => tool.name))
          }
        }
        buffer = buffer.slice(buffer.lastIndexOf('\n') + 1)
      })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'opencraw-e2e', version: '1' } } })}\n`)
    })
  } finally {
    child.kill()
  }
}

async function run () {
  const extension = vscode.extensions.getExtension('opencraw.opencraw')
  assert.ok(extension, 'the extension is installed')
  const api = await extension.activate()

  const registered = await vscode.commands.getCommands(true)
  assert.ok(registered.includes('opencraw.openStudio'), 'Open Studio is registered')
  assert.ok(registered.includes('opencraw.openOn'), 'Open on OpenCraw is registered')
  for (const name of ['runRecipe', 'openRecipeInStudio', 'refreshRecipes', 'showWalkthrough', 'openLink']) assert.ok(registered.includes(`opencraw.${name}`), `${name} is registered`)

  // The MCP server the extension registers with the editor's agent mode starts, and offers OpenCraw's tools.
  const tools = await mcpToolNames(api.mcpServerScript())
  for (const name of ['probe', 'validate', 'run', 'list_recipes', 'docs']) assert.ok(tools.includes(name), `the MCP server offers ${name} (offers: ${tools.join(', ')})`)

  // The recipes view lists the workspace's recipes by the output they fill: an input whose output is missing is kept, under its name.
  const groups = await api.recipeGroups()
  assert.deepEqual(groups.map(group => [group.outputId, group.outputFile !== undefined, group.inputs.map(input => input.id)]), [['cars', true, ['byd', 'kia']], ['elsewhere', false, ['lost']]])

  const folder = vscode.workspace.workspaceFolders[0].uri
  const report = vscode.Uri.joinPath(folder, 'docs', 'report.csv')

  // A document in the workspace: the link names it and the workspace, the page is served, the server resolves it.
  const first = nextLink(api)
  await vscode.commands.executeCommand('opencraw.openOn', report)
  const link = await first
  const url = new URL(link)
  assert.equal(url.searchParams.get('open'), report.fsPath)
  assert.equal(url.searchParams.get('folder'), folder.fsPath)
  const page = await fetch(url)
  assert.equal(page.status, 200, 'Studio serves its page')
  const view = await command(link, { type: 'open-path', path: report.fsPath, workspace: folder.fsPath })
  assert.equal(view.kind, 'document')
  assert.equal(view.path, report.fsPath, 'a document inside the workspace is read in place')

  // A folder resolves as a folder.
  const second = nextLink(api)
  await vscode.commands.executeCommand('opencraw.openOn', folder)
  const secondLink = await second
  const folderView = await command(secondLink, { type: 'open-path', path: folder.fsPath })
  assert.equal(folderView.kind, 'folder')

  // The hooks setting reaches the server: set it, open again, and the workspace names the hook.
  const hooksFolder = mkdtempSync(join(tmpdir(), 'opencraw-hooks-'))
  const hooks = join(hooksFolder, 'hooks.mjs')
  writeFileSync(hooks, 'export const hooks = { shout: value => String(value).toUpperCase() }\n')
  await vscode.workspace.getConfiguration('opencraw').update('hooksFile', hooks, vscode.ConfigurationTarget.Global)
  const third = nextLink(api)
  await vscode.commands.executeCommand('opencraw.openOn', folder)
  const thirdLink = await third
  const workspaceView = await command(thirdLink, { type: 'open-workspace', folder: folder.fsPath })
  assert.deepEqual(workspaceView.hooks?.names, ['shout'])
}

module.exports = { run }
