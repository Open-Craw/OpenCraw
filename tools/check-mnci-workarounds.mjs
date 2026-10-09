// Guards for two things `mnci upgrade` or a Windows `npm install` breaks in this repo. Temporary:
// remove this file, its CI step and the package.json script once the issues listed in
// docs/mnci-workarounds.md are fixed upstream and the workspace has been upgraded.
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const problems = []

// MoNecromanCI/MoNecromanCi#421: the upgrade rewrites overrides.nx and drops this entry.
if (manifest.overrides?.nx?.undici === undefined) {
  problems.push('package.json overrides.nx.undici is missing: `mnci upgrade` drops it, which brings back a high undici advisory. Add "undici": "^7.29.1" under overrides.nx and run npm install.')
}

// npm on Windows prunes these optional nested entries; Linux `npm ci` then fails with "Missing: @emnapi/core ... from lock file".
const nested = Object.keys(lock.packages).filter(key => /wasm32-wasi\/node_modules\/@emnapi\/(?:core|runtime)$/.test(key))
if (nested.length < 4) {
  problems.push(`package-lock.json has ${nested.length} of 4 nested @emnapi/core and @emnapi/runtime entries under the wasm32-wasi bindings: a Windows npm install pruned them and \`npm ci\` fails on Linux. Restore them from the lockfile on main.`)
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`✖ ${problem}`)
  process.exitCode = 1
} else {
  console.log('mnci workarounds in place')
}
