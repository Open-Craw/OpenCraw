// Guards for what a Windows `npm install` or a publishable Python package breaks in this repo. Temporary:
// remove this file, its CI step and the package.json script once the issues listed in
// docs/mnci-workarounds.md are fixed upstream and the workspace has been upgraded.
import { globSync, readFileSync } from 'node:fs'

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const problems = []

// npm on Windows prunes these optional nested entries; Linux `npm ci` then fails with "Missing: @emnapi/core ... from lock file".
const nested = Object.keys(lock.packages).filter(key => /wasm32-wasi\/node_modules\/@emnapi\/(?:core|runtime)$/.test(key))
if (nested.length < 4) {
  problems.push(`package-lock.json has ${nested.length} of 4 nested @emnapi/core and @emnapi/runtime entries under the wasm32-wasi bindings: a Windows npm install pruned them and \`npm ci\` fails on Linux. Restore them from the lockfile on main.`)
}

// Not an mnci bug: `mnci ci release` globs python-packages/*/pyproject.toml, demands PYPI_TOKEN for any it finds
// and ignores release.projects (issue #199). Publishing to PyPI is the owner's decision, so the Python package
// stays an internal lib under libs/.
const publishable = globSync('python-packages/*/pyproject.toml')
if (publishable.length > 0) {
  problems.push(`${publishable.join(', ')}: a Python project under python-packages/ makes the release step demand PYPI_TOKEN and fail. Keep it under libs/ until the owner decides to publish to PyPI.`)
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`✖ ${problem}`)
  process.exitCode = 1
} else {
  console.log('mnci workarounds in place')
}
