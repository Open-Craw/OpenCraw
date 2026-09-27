// Generates what the how-it-works guide shows: for each scene, it runs the scene's recipes with
// `debug` on (scope snapshots and each field's mapping trace), keeps the trace lines and records,
// takes the screenshots with the selected elements highlighted, then fills the marked regions of the
// guide's pages. Nothing in those regions is written by hand.
//
//   npm run docs:capture                      every scene, then the pages
//   npm run docs:capture -- --only books-list one scene, then the pages
//   npm run docs:capture -- --render          the pages from the saved captures, no network
//   npm run docs:capture -- --check           load and bind every scene's recipes, nothing else (CI)
//
// OPENCRAW_CHROMIUM picks a Chromium binary; OPENCRAW_INSECURE_TLS=1 accepts an intercepting proxy.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCrawler, loadRecipeSet, memorySink, readPdf, traceLine } from '@opencraw/core'
import { chromium } from 'playwright'
import { SCENES } from './scenes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const guide = dirname(here)
const CAPTURES = join(guide, 'captures')
const RECIPES = join(guide, 'recipes')
const SHOTS = join(guide, '..', 'assets', 'how-it-works')
const browserOptions = { executablePath: process.env.OPENCRAW_CHROMIUM || undefined, ignoreHTTPSErrors: process.env.OPENCRAW_INSECURE_TLS === '1' }

const argument = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined)
const only = argument('--only')
const scenes = SCENES.filter(scene => only === undefined || scene.name === only)
if (scenes.length === 0) throw new Error(`no scene named "${only}"`)

if (process.argv.includes('--check')) await check(SCENES)
else {
  if (!process.argv.includes('--render')) {
    await mkdir(CAPTURES, { recursive: true })
    await mkdir(SHOTS, { recursive: true })
    const browser = await chromium.launch({ executablePath: browserOptions.executablePath })
    try {
      for (const scene of scenes) await capture(scene, browser)
    } finally {
      await browser.close()
    }
  }
  await render()
}

/** The scene's recipe set: every JSON file in its recipes folder. */
async function recipesOf (scene) {
  const folder = join(RECIPES, scene.recipes ?? scene.name)
  const names = await readdir(folder)
  const files = names.filter(file => file.endsWith('.json')).map(file => join(folder, file))

  return loadRecipeSet({ output: files, inputs: files })
}

async function check (all) {
  let failed = 0
  for (const scene of all) {
    try {
      const set = await recipesOf(scene)
      console.log(`✓ ${scene.name}: ${set.inputs.map(input => input.id).join(', ')} → ${set.output.id}`)
    } catch (error) {
      failed += 1
      console.error(`✖ ${scene.name}: ${error.message}`)
    }
  }
  if (failed > 0) process.exitCode = 1
}

async function capture (scene, browser) {
  console.log(`▶ ${scene.name}`)
  const recipes = await recipesOf(scene)
  const trace = []
  const records = []
  const crawler = createCrawler({
    debug:   true,
    sink:    memorySink(),
    browser: browserOptions,
    ...scene.crawler,
    onEvent: (event) => {
      const line = traceLine(event)
      if (line !== undefined) trace.push(line)
      if (event.type === 'record:emit') records.push({ url: event.url, key: event.key, data: event.data, scope: event.scope, mapping: event.mapping })
      else if (event.type === 'record:reject') records.push({ url: event.url, rejected: { field: event.field, reason: event.reason }, scope: event.scope })
    },
  })
  let report
  try {
    report = await crawler.run(recipes)
  } finally {
    await crawler.close()
  }
  const shots = scene.screenshots ?? []
  for (const [index, shot] of shots.entries()) {
    const path = join(SHOTS, `${scene.name}${index === 0 ? '' : `-${index + 1}`}.png`)
    await (shot.pdf === undefined ? screenshot(browser, shot, path) : pdfFigure(browser, shot, path))
  }
  const summary = report.recipes.map(({ recipeId, emitted, rejected, duplicates, pages, error }) => ({ recipeId, emitted, rejected, duplicates, pages, ...(error !== undefined && { error }) }))
  await writeFile(join(CAPTURES, `${scene.name}.json`), `${JSON.stringify({ scene: scene.name, summary, trace: trace.map(line => stripTimings(line)), records: records.slice(0, scene.keep ?? 5) }, null, 2)}\n`)
  for (const recipe of summary) console.log(`  ${recipe.recipeId}: ${recipe.emitted} emitted, ${recipe.rejected} rejected${recipe.error === undefined ? '' : `, stopped: ${recipe.error}`}`)
}

/** Timings change on every run; the guide shows `… ms` so a re-capture only changes what really changed. */
function stripTimings (line) {
  return line.replaceAll(/\b\d+ ms\b/g, '… ms')
}

/**
 * Opens `shot.url`, runs its `steps` (fill, click, wait), outlines every element matching each
 * `highlight` with its label, and saves the viewport, or the `clip` element with a margin.
 */
async function screenshot (browser, shot, path) {
  const page = await browser.newPage({ viewport: { width: shot.width ?? 1200, height: shot.height ?? 800 }, deviceScaleFactor: 1, ignoreHTTPSErrors: browserOptions.ignoreHTTPSErrors })
  try {
    await page.goto(shot.url, { waitUntil: 'load' })
    const steps = shot.steps ?? []
    for (const step of steps) {
      if (step.fill !== undefined) await page.fill(step.fill, step.value)
      if (step.click !== undefined) await Promise.all([page.waitForLoadState('load'), page.click(step.click)])
      if (step.wait !== undefined) await page.waitForSelector(step.wait)
      if (step.select !== undefined) await Promise.all([page.waitForLoadState('load'), page.selectOption(step.select, step.value)])
    }
    await page.evaluate((highlights) => {
      const { document, scrollX, scrollY } = globalThis
      for (const [index, { selector, label, color }] of highlights.entries()) {
        const colour = color ?? ['#e4572e', '#2e86ab', '#3bb273', '#9b5de5'][index % 4]
        const elements = [...document.querySelectorAll(selector)]
        for (const [position, element] of elements.entries()) {
          element.style.outline = `3px solid ${colour}`
          element.style.outlineOffset = '2px'
          if (label !== undefined && position === 0) {
            const badge = document.createElement('span')
            badge.textContent = label
            badge.style.cssText = `position:absolute;z-index:99999;background:${colour};color:#fff;font:600 12px/1.6 system-ui,sans-serif;padding:0 6px;border-radius:3px;white-space:nowrap`
            const box = element.getBoundingClientRect()
            badge.style.left = `${box.left + scrollX}px`
            badge.style.top = `${Math.max(0, box.top + scrollY - 22)}px`
            document.body.append(badge)
          }
        }
      }
    }, shot.highlight ?? [])
    const clip = shot.clip === undefined ? undefined : await page.locator(shot.clip).first().boundingBox()
    const margin = 16
    await page.screenshot({ path, ...(clip !== null && clip !== undefined && { clip: { x: Math.max(0, clip.x - margin), y: Math.max(0, clip.y - margin - 22), width: clip.width + margin * 2, height: Math.min(clip.height + margin * 2 + 22, shot.maxHeight ?? 900) }, fullPage: true }) })
    console.log(`  screenshot ${relative(guide, path)}`)
  } finally {
    await page.close()
  }
}

/**
 * What the PDF reader sees, drawn on the page itself: pdf.js renders `shot.page` of `shot.pdf` in the
 * browser, then every cell `readPdf` found is outlined, one colour per row, and the rows whose text
 * matches `shot.header` are filled. `shot.region` ([x, y, width, height] in PDF points from the top
 * left) crops the figure.
 */
async function pdfFigure (browser, shot, path) {
  const response = await fetch(shot.pdf)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const document = await readPdf(bytes, shot.pdf)
  const page = document.pages[(shot.page ?? 1) - 1]
  const scale = shot.scale ?? 2
  const require = createRequire(import.meta.url)
  const build = dirname(require.resolve('pdfjs-dist/package.json'))
  const header = shot.header === undefined ? undefined : new RegExp(shot.header)
  const rows = page.rows.map(row => ({ header: header?.test(row.cells.map(cell => cell.text).join(' ')) === true, cells: row.cells.map(({ x, y, width, height }) => ({ x, y, width, height })) }))
  const tab = await browser.newPage({ viewport: { width: Math.ceil(page.width * scale), height: Math.ceil(page.height * scale) } })
  try {
    await tab.route('**/pdfjs/**', route => route.fulfill({ path: join(build, 'legacy', 'build', route.request().url().split('/pdfjs/', 2)[1]) }))
    await tab.route('https://figure.local/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"><canvas id="c"></canvas></body></html>' }))
    await tab.goto('https://figure.local/')
    await tab.evaluate(async ({ data, number, scale, rows }) => {
      const { atob, document } = globalThis
      const pdfjs = await import('https://figure.local/pdfjs/pdf.min.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://figure.local/pdfjs/pdf.worker.min.mjs'
      const pdf = await pdfjs.getDocument({ data: Uint8Array.from(atob(data), char => char.codePointAt(0)) }).promise
      const pdfPage = await pdf.getPage(number)
      const viewport = pdfPage.getViewport({ scale })
      const canvas = document.getElementById('c')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext('2d')
      await pdfPage.render({ canvasContext: context, viewport }).promise
      const height = viewport.height / scale
      for (const [index, row] of rows.entries()) {
        const colour = row.header ? '#e4572e' : ['#2e86ab', '#3bb273'][index % 2]
        for (const cell of row.cells) {
          const left = cell.x * scale
          const top = (height - cell.y - cell.height) * scale
          context.lineWidth = 1.5
          context.strokeStyle = colour
          context.strokeRect(left, top, Math.max(cell.width, 1) * scale, cell.height * scale * 1.2)
          if (row.header) {
            context.fillStyle = 'rgba(228, 87, 46, 0.15)'
            context.fillRect(left, top, Math.max(cell.width, 1) * scale, cell.height * scale * 1.2)
          }
        }
      }
    }, { data: Buffer.from(bytes).toString('base64'), number: shot.page ?? 1, scale, rows })
    const [x, y, width, height] = shot.region ?? [0, 0, page.width, page.height]
    await tab.screenshot({ path, clip: { x: x * scale, y: y * scale, width: width * scale, height: height * scale } })
    console.log(`  pdf figure ${relative(guide, path)} (${page.rows.length} rows on page ${shot.page ?? 1})`)
  } finally {
    await tab.close()
  }
}

/** Fills every `<!-- capture:scene part options -->…<!-- /capture -->` region of the guide's pages. */
async function render () {
  const files = await readdir(guide)
  const pages = files.filter(file => file.endsWith('.md'))
  const cache = new Map()
  const load = async (name) => {
    if (!cache.has(name)) {
      const text = await readFile(join(CAPTURES, `${name}.json`), 'utf8')
      cache.set(name, JSON.parse(text))
    }

    return cache.get(name)
  }
  for (const file of pages) {
    const path = join(guide, file)
    const text = await readFile(path, 'utf8')
    const regions = text.matchAll(/<!-- capture:([^\s>]+) ([^\s>]+)((?: [^\s>]+)*) -->\n[\s\S]*?<!-- \/capture -->/g).toArray()
    let result = text
    for (const [whole, scene, part, rawOptions] of regions) {
      const options = Object.fromEntries(rawOptions.trim().split(/\s+/).filter(Boolean).map(option => option.split('=', 2)))
      const body = await fragment(await load(scene), scene, part, options)
      result = result.replace(whole, () => `<!-- capture:${scene} ${part}${rawOptions} -->\n${body}\n<!-- /capture -->`)
    }
    if (result !== text) {
      await writeFile(path, result)
      console.log(`rendered ${file} (${regions.length} regions)`)
    }
  }
}

async function fragment (captured, scene, part, options) {
  const record = captured.records[Number(options.record ?? 0)]
  switch (part) {
    case 'screenshot': {
      const suffix = options.n === undefined || options.n === '1' ? '' : `-${options.n}`

      return `![${options.alt?.replaceAll('_', ' ') ?? scene}](../assets/how-it-works/${scene}${suffix}.png)`
    }
    case 'scope': {
      const ids = options.ids?.split(',') ?? Object.keys(record.scope ?? {})
      const scope = Object.fromEntries(ids.filter(id => Object.hasOwn(record.scope ?? {}, id)).map(id => [id, shorten(record.scope[id])]))

      return fence('json', JSON.stringify(scope, null, 2))
    }
    case 'mapping': {
      const fields = options.fields?.split(',') ?? Object.keys(record.mapping ?? {})
      const rows = ['| Field | Step | Value |', '|---|---|---|']
      for (const field of fields) {
        const trace = record.mapping?.[field]
        if (trace === undefined) continue
        rows.push(`| \`${field}\` | read | ${cell(trace.from)} |`)
        for (const step of trace.steps) rows.push(`| | \`${step.op}\` | ${cell(step.value)} |`)
        rows.push(`| | **field** | ${cell(getPath(record.data, field))} |`)
      }

      return rows.join('\n')
    }
    case 'record': {
      const { data, rejected } = record

      return fence('json', JSON.stringify(rejected === undefined ? shorten(data) : { rejected }, null, 2))
    }
    case 'records': {
      const count = Number(options.n ?? 3)

      return fence('json', captured.records.slice(0, count).map(({ data, rejected }) => JSON.stringify(rejected === undefined ? shorten(data) : { rejected })).join('\n'))
    }
    case 'trace': {
      const lines = options.grep === undefined ? captured.trace : captured.trace.filter(line => new RegExp(options.grep.replaceAll('_', ' ')).test(line))
      const count = Number(options.lines ?? 30)

      return fence('text', [...lines.slice(0, count), ...(lines.length > count ? ['  …'] : [])].join('\n'))
    }
    case 'summary': {
      return fence('text', captured.summary.map(({ recipeId, emitted, rejected, duplicates, pages, error }) => `${recipeId}: ${emitted} emitted, ${rejected} rejected, ${duplicates} duplicates, ${pages} pages${error === undefined ? '' : `, stopped: ${error}`}`).join('\n'))
    }
    default: {
      throw new Error(`unknown capture part "${part}" for ${scene}`)
    }
  }
}

function getPath (data, path) {
  return path.replaceAll(/\[(\d+)\]/g, '.$1').split('.').reduce((value, key) => value?.[key], data)
}

/** Long strings and lists cut down for reading; the capture file keeps them whole. */
function shorten (value, depth = 0) {
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 157)}…` : value
  if (Array.isArray(value)) return value.length > 4 ? [...value.slice(0, 3).map(item => shorten(item, depth + 1)), `… ${value.length - 3} more`] : value.map(item => shorten(item, depth + 1))
  if (value !== null && typeof value === 'object') return depth > 3 ? '{…}' : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shorten(item, depth + 1)]))

  return value
}

function cell (value) {
  const text = value === undefined ? '*(missing)*' : `\`${JSON.stringify(shorten(value)).replaceAll('|', String.raw`\|`).replaceAll('`', 'ˋ')}\``

  return text.length > 220 ? `${text.slice(0, 217)}…\`` : text
}

function fence (language, body) {
  return `\`\`\`${language}\n${body}\n\`\`\``
}
