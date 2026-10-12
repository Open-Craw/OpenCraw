// Builds the extension's .vsix: stages a folder with the bundled extension and its production dependencies
// installed from tarballs of the workspace packages (so the extension carries exactly what is built here),
// starts the staged Studio process once to prove the dependencies are complete, then runs vsce on it.
// Run after `nx build @opencraw/vscode` and the builds of the packages it uses. Nothing is published.
import { execFileSync, fork } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appDir, '..', '..')
const stage = join(appDir, 'dist-vsix')
const tarballs = join(stage, 'tarballs')
const PACKAGES = ['core', 'office-reader', 'probe', 'studio', 'cli']

// Run npm's own CLI with this Node: no shell, so no quoting to get wrong and no .cmd shim on Windows.
const npmCli = process.env.npm_execpath ?? [
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  join(dirname(dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
].find(candidate => existsSync(candidate))
if (npmCli === undefined) throw new Error('npm was not found next to this Node: run this through `npm run`')
const npm = (args, options) => execFileSync(process.execPath, [npmCli, ...args], options)

for (const required of [join(appDir, 'dist', 'extension.cjs'), join(appDir, 'dist', 'studio-host.process.mjs'), join(repoRoot, 'packages', 'studio', 'dist', 'ui', 'index.html')]) {
  if (!existsSync(required)) throw new Error(`${required} is missing: build the extension, the Studio server and the UI first`)
}

rmSync(stage, { recursive: true, force: true })
mkdirSync(tarballs, { recursive: true })

const dependencies = {}
for (const name of PACKAGES) {
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', tarballs], { cwd: join(repoRoot, 'packages', name) }).toString())
  dependencies[`@opencraw/${name}`] = `file:tarballs/${packed[0].filename}`
}

const source = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'))
writeFileSync(join(stage, 'package.json'), JSON.stringify({
  name:             'opencraw',
  displayName:      source.displayName,
  description:      source.description,
  version:          source.version,
  publisher:        source.publisher,
  icon:             source.icon,
  license:          'UNLICENSED',
  engines:          source.engines,
  categories:       source.categories,
  activationEvents: source.activationEvents,
  contributes:      source.contributes,
  main:             './dist/extension.cjs',
  // The workspace packages depend on each other by version; those requests are met by these same tarballs,
  // installed side by side. No `overrides`: with them `npm ls`, which vsce runs, reports valid ranges invalid.
  dependencies,
}, undefined, 2))
mkdirSync(join(stage, 'dist'))
cpSync(join(appDir, 'dist', 'extension.cjs'), join(stage, 'dist', 'extension.cjs'))
cpSync(join(appDir, 'dist', 'studio-host.process.mjs'), join(stage, 'dist', 'studio-host.process.mjs'))
cpSync(join(appDir, 'README.md'), join(stage, 'README.md'))
cpSync(join(appDir, 'media'), join(stage, 'media'), { recursive: true })
writeFileSync(join(stage, '.vscodeignore'), 'tarballs/**\n')

npm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], { cwd: stage, stdio: 'inherit' })

// The staged Studio process starts, answers a link and ends with its channel: its dependencies are all there.
await new Promise((resolve, reject) => {
  const child = fork(join(stage, 'dist', 'studio-host.process.mjs'), [JSON.stringify({ workspace: stage })], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  const timer = setTimeout(() => {
    child.kill()
    reject(new Error('the staged Studio process did not start within 60 s'))
  }, 60_000)
  child.on('message', message => {
    if (message.type === 'ready') {
      child.send({ type: 'link', id: 1, target: { open: stage } })
    } else if (message.type === 'link' && message.url.includes('open=')) {
      clearTimeout(timer)
      child.disconnect()
      resolve()
    } else if (message.type === 'failed') {
      clearTimeout(timer)
      reject(new Error(`the staged Studio process failed: ${message.message}`))
    }
  })
  child.on('exit', code => {
    if (code !== 0) reject(new Error(`the staged Studio process ended with exit ${code}`))
  })
})

// `--stage-only`: the staged folder is the extension as the editor loads it, which is all the editor
// end-to-end test needs; the .vsix is skipped.
if (process.argv.includes('--stage-only')) {
  process.stdout.write(`staged ${stage}\n`)
} else {
  // The vsce release that packs the extension; fixed so a build does not change with the registry.
  const VSCE = '@vscode/vsce@4.0.0'
  // The engine reads documents through native modules (a canvas for PDF pages), installed for the platform
  // this runs on, so the package is for this platform only: the same names the editor's marketplace uses.
  const target = `${process.platform}-${process.arch}`
  const out = join(appDir, `opencraw-${source.version}-${target}.vsix`)
  npm(['exec', '--yes', `--package=${VSCE}`, '--', 'vsce', 'package', '--target', target, '--out', out, '--allow-missing-repository', '--skip-license', '--no-update-package-json'], { cwd: stage, stdio: 'inherit' })
  process.stdout.write(`packaged ${out}\n`)
}
