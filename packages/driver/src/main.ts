#!/usr/bin/env node
// opencraw-driver: the driver protocol on this process's stdin and stdout. stdout carries protocol
// messages only, so anything else that would print there (a library's console.log) goes to stderr.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveDriver } from './server'

console.log = console.error
console.info = console.error

/** The version in the nearest package.json named @opencraw/driver, walking up from this file. */
function driverVersion (): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string, version?: string }
      if (manifest.name === '@opencraw/driver' && manifest.version !== undefined) return manifest.version
    } catch {
      // no manifest here: look one level up
    }
    dir = dirname(dir)
  }

  return '0.0.0'
}

await serveDriver(process.stdin, process.stdout, { driverVersion: driverVersion() })
process.exit(0)
