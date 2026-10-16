// Starts a real VS Code (the oldest one the extension supports), loads the staged extension into it and runs
// ./suite/index.cjs in its extension host. Run after `node packaging/package-vsix.mjs --stage-only`; the nx
// target `e2e` does both. The first run downloads the editor into .vscode-test.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTests } from '@vscode/test-electron'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** The oldest editor the extension claims to support (`engines.vscode`). */
const VERSION = '1.127.0'

const workspace = mkdtempSync(join(tmpdir(), 'opencraw-editor-workspace-'))
const profile = mkdtempSync(join(tmpdir(), 'opencraw-editor-profile-'))
mkdirSync(join(workspace, 'docs'))
writeFileSync(join(workspace, 'docs', 'report.csv'), 'name,price\nbook,10\n')
// Recipes for the recipes view: two inputs that fill one output, and an input whose output is not in the workspace.
writeFileSync(join(workspace, 'cars.ocw-out.json'), JSON.stringify({ kind: 'output', id: 'cars', version: 1, fields: { model: { type: 'string' } } }))
writeFileSync(join(workspace, 'kia.ocw-in.json'), JSON.stringify({ kind: 'input', id: 'kia', output: 'cars', mode: 'api', start: [], steps: [] }))
writeFileSync(join(workspace, 'byd.ocw-in.json'), JSON.stringify({ kind: 'input', id: 'byd', output: 'cars', mode: 'api', start: [], steps: [] }))
writeFileSync(join(workspace, 'lost.ocw-in.json'), JSON.stringify({ kind: 'input', id: 'lost', output: 'elsewhere', mode: 'api', start: [], steps: [] }))

try {
  await runTests({
    version:                  VERSION,
    cachePath:                join(appDir, '.vscode-test'),
    extensionDevelopmentPath: join(appDir, 'dist-vsix'),
    extensionTestsPath:       join(appDir, 'e2e', 'suite', 'index.cjs'),
    launchArgs:               [
      workspace,
      '--disable-extensions',
      '--disable-workspace-trust',
      `--user-data-dir=${join(profile, 'user-data')}`,
      `--extensions-dir=${join(profile, 'extensions')}`,
      // A CI runner has no setuid sandbox helper for Electron. The extension never sets this flag.
      ...process.env.CI === undefined ? [] : ['--no-sandbox'],
    ],
  })
} finally {
  // The editor can still hold its profile for a moment (Windows): a leftover temp folder must not hide the result.
  for (const folder of [workspace, profile]) {
    try {
      rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    } catch {
      process.stderr.write(`could not remove ${folder}
`)
    }
  }
}
