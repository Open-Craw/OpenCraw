// Written by smith convert: what mnci's rollup plugin did to declarations.
// tsc writes relative specifiers as the sources spell them ('./hooks'); a
// node16 or nodenext consumer of an ES module package needs the file
// ('./hooks.js', or './hooks/index.js' for a folder). Run after tsc with the
// declaration directory: node declaration-specifiers.mjs dist/src
import fs from 'node:fs'
import path from 'node:path'

const directory = process.argv[2]
const specifier = /((?:from|import)\s*(?:\(\s*)?)(['"])(\.{1,2}(?:\/[^'"]*)?)\2/g
const resolved = /\.(?:[cm]?js|json)$/

function withFile (from, quote, prefix, name) {
  if (resolved.test(name)) return null
  const bare = name.replace(/\/$/, '')
  if (fs.existsSync(path.join(from, bare + '.d.ts'))) return prefix + quote + bare + '.js' + quote
  if (fs.existsSync(path.join(from, bare, 'index.d.ts'))) return prefix + quote + bare + '/index.js' + quote

  return null
}

const entries = fs.readdirSync(directory, { recursive: true })

for (const entry of entries) {
  if (!String(entry).endsWith('.d.ts')) continue
  const file = path.join(directory, String(entry))
  const from = path.dirname(file)
  const text = fs.readFileSync(file, 'utf8')
  const out = text.replaceAll(specifier, (match, prefix, quote, name) => withFile(from, quote, prefix, name) ?? match)
  if (out !== text) fs.writeFileSync(file, out)
}
