// npm start                          the local demo: a fake widget and a fake CapSolver API, nothing leaves the machine
// CAPSOLVER_KEY=... npm start        the real CapSolver on Google's reCAPTCHA demo page (costs one solve)
import { crawl } from './crawl.mjs'

const apiKey = process.env.CAPSOLVER_KEY
if (apiKey === undefined || apiKey === '') {
  console.log('No CAPSOLVER_KEY: running the local demo (a fake reCAPTCHA page and a fake CapSolver API).')
  console.log('Set CAPSOLVER_KEY to solve a real reCAPTCHA through CapSolver instead.\n')
}
const { report, live } = await crawl({ apiKey })
const [recipe] = report.recipes
console.log(`\n${report.records} records written to ${report.sink.location}`)
console.log(`  captchas: ${recipe.captchas.detected} detected, ${recipe.captchas.solved} solved, ${recipe.captchas.failed} failed${live ? '' : ' (fake API)'}`)
if (recipe.error !== undefined || report.records === 0) {
  console.log(`  stopped: ${recipe.error ?? 'nothing was written'}`)
  process.exitCode = 1
}
