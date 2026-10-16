// Records the Studio tutorial "One recipe for two PDFs of one layout": the screenshots under
// docs/assets/studio/pdf-agreements/ and a narrated video of the same walk-through.
//
//   npm run build                      (the packages the Studio runs from)
//   node docs/studio/capture/pdf-agreements.mjs
//
// Needs: the repository built, Playwright's Chromium and ffmpeg on the PATH (or FFMPEG=…). The narration is
// Piper's neural voice when PIPER_MODEL points at a voice (.onnx; PIPER at the executable, default "piper"),
// otherwise, on Windows, the system's own speech voice (NARRATION_VOICE picks one, default "Microsoft Zira Desktop").
// Everything is driven through the Studio's own UI, the way a person would: the script finds a line by its
// text on the PDF page and clicks it.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const shots = join(root, 'docs', 'assets', 'studio', 'pdf-agreements')
const sources = join(root, 'examples', 'pdf-agreements')
const work = join(tmpdir(), `opencraw-tutorial-${Date.now()}`)
const folder = join(work, 'recipes')
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const VOICE = process.env.NARRATION_VOICE ?? 'Microsoft Zira Desktop'
const PIPER = process.env.PIPER ?? 'piper'
const PIPER_MODEL = process.env.PIPER_MODEL
const SIZE ={ width: 1360, height: 860 }

mkdirSync(shots, { recursive: true })
mkdirSync(folder, { recursive: true })
mkdirSync(join(work, 'audio'), { recursive: true })
for (const stale of readdirSync(shots)) rmSync(join(shots, stale))

/** Speaks `text` to a WAV file; returns its length in milliseconds. Piper when PIPER_MODEL is set, else the system voice. */
function speak (text, file) {
  if (PIPER_MODEL !== undefined) execFileSync(PIPER, ['--model', PIPER_MODEL, '--length_scale', '1.05', '--output_file', file], { input: text, stdio: ['pipe', 'ignore', 'ignore'] })
  else speakWithSystemVoice(text, file)
  const bytes = readFileSync(file)
  const byteRate = bytes.readUInt32LE(28)

  return Math.round(((bytes.length - 44) / byteRate) * 1000)
}

function speakWithSystemVoice (text, file) {
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$s.SelectVoice($env:NARRATION_VOICE)',
    '$s.Rate = -1',
    '$s.SetOutputToWaveFile($env:NARRATION_FILE)',
    '$s.Speak($env:NARRATION_TEXT)',
    '$s.Dispose()',
  ].join('; ')
  execFileSync('powershell', ['-NoProfile', '-Command', script], { env: { ...process.env, NARRATION_VOICE: VOICE, NARRATION_FILE: file, NARRATION_TEXT: text } })
}

// -- the Studio ------------------------------------------------------------------------------------------------
const server = spawn(process.execPath, [join(root, 'packages', 'cli', 'bin', 'opencraw.mjs'), 'studio', folder], { stdio: ['ignore', 'pipe', 'inherit'] })
const url = await new Promise((resolveUrl, reject) => {
  let text = ''
  server.stdout.on('data', (chunk) => {
    text += String(chunk)
    const found = /http:\/\/127\.0\.0\.1:\d+\/\?[^\s]+/.exec(text)
    if (found !== null) resolveUrl(found[0])
  })
  server.on('exit', () => { reject(new Error('the Studio stopped before it printed its address')) })
})
const token = new URL(url).searchParams.get('token')

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: join(work, 'video'), size: SIZE } })
const startedAt = Date.now()
const page = await context.newPage()
await page.goto(url)
await page.getByRole('button', { name: 'Load ▾' }).waitFor()

const timeline = []
let shot = 0

async function caption (text) {
  await page.evaluate((words) => {
    let bar = document.getElementById('tutorial-caption')
    if (bar === null) {
      bar = document.createElement('div')
      bar.id = 'tutorial-caption'
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:12px 28px;background:rgba(17,24,39,.92);color:#fff;font:600 17px/1.4 system-ui,sans-serif;text-align:center;pointer-events:none'
      document.body.append(bar)
    }
    bar.textContent = words
  }, text)
}

async function snap (name) {
  shot += 1
  // The caption belongs to the video; the manual's pictures show the Studio alone.
  await page.evaluate(() => { const bar = document.getElementById('tutorial-caption'); if (bar !== null) bar.style.visibility = 'hidden' })
  await page.screenshot({ path: join(shots, `${String(shot).padStart(2, '0')}-${name}.png`) })
  await page.evaluate(() => { const bar = document.getElementById('tutorial-caption'); if (bar !== null) bar.style.visibility = 'visible' })
}

/** Narrates one step: shows the caption, starts the voice, runs `act`, and holds until the sentence has been said. */
async function step (id, text, act) {
  const wav = join(work, 'audio', `${id}.wav`)
  const duration = speak(text, wav)
  await caption(text)
  const from = Date.now() - startedAt
  timeline.push({ wav, from })
  const before = Date.now()
  if (act !== undefined) await act()
  const spent = Date.now() - before
  await page.waitForTimeout(Math.max(duration + 700 - spent, 300))
}

/** Moves the pointer over, and clicks, the line of the PDF page (the first) that starts with `text`. */
async function clickLine (text, { shift = false } = {}) {
  const recipe = (await page.getByRole('button', { name: /^Recipe/ }).innerText()).replace(/^Recipe:\s*/, '').replace(/\s*▾$/, '').trim()
  const view = await page.evaluate(async (id) => {
    const token = new URL(location.href).searchParams.get('token')
    const response = await fetch(`/api/command?token=${token}`, { method: 'POST', body: JSON.stringify({ type: 'pdf-view', recipeId: id, path: 'start' }) })

    return response.json()
  }, recipe)
  const pdfPage = view.pages[0]
  const cell = pdfPage.rows.flatMap(row => row.cells).find(candidate => candidate.text.toLowerCase().startsWith(text.toLowerCase()))
  if (cell === undefined) throw new Error(`no line starting "${text}" on the first page`)
  const overlay = page.getByTestId('pdf-overlay')
  const box = await overlay.boundingBox()
  const scale = box.width / pdfPage.width
  const targetY = (pdfPage.height - (cell.y + cell.height / 2)) * scale
  await page.evaluate((y) => {
    let scroller = document.querySelector('[data-testid="pdf-overlay"]')
    while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
    if (scroller !== null) scroller.scrollTop = Math.max(y - scroller.clientHeight / 2, 0)
  }, targetY)
  await page.waitForTimeout(150)
  const moved = await overlay.boundingBox()
  const x = moved.x + (cell.x + Math.min(cell.width, 400) / 2) * scale
  const y = moved.y + targetY
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.click(x, y)
  if (shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(500)
}

async function addToRecipe () {
  await page.getByRole('button', { name: 'Add to recipe' }).click()
  await page.waitForTimeout(400)
}

async function loadDocument (file) {
  await page.getByRole('button', { name: 'Load ▾' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Document…' }).click()
  await (await chooser).setFiles(file)
}

// -- the walk-through ------------------------------------------------------------------------------------------
await step('intro', 'OpenCraw Studio. We will build one recipe that reads two agreement PDFs. They share a structure, but they do not look alike.', async () => {
  await snap('empty-studio')
})

await step('load', 'Open the Load menu and choose Document. The Studio copies the file next to the recipes and starts a recipe named after it.', async () => {
  await page.getByRole('button', { name: 'Load ▾' }).click()
  await snap('load-menu')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Document…' }).click()
  await (await chooser).setFiles(join(sources, 'agreement.pdf'))
  await page.getByTestId('pdf-overlay').waitFor()
  await page.waitForTimeout(1200)
  await snap('document-loaded')
})

await step('canvas', 'The page is drawn with every line of text the engine found outlined. Headings, labels, a table and two paragraphs: this is the structure we will anchor on.', async () => {
  await page.waitForTimeout(300)
})

await step('label', 'Click the reference ID. The note under the selection says it reads the value after its label, so it will not depend on where the line sits.', async () => {
  await clickLine('Reference ID')
  await snap('label-selected')
  await addToRecipe()
})

await step('labels', 'The effective date and the status are added the same way, each with its own label.', async () => {
  await clickLine('Effective Date')
  await addToRecipe()
  await clickLine('Status:')
  await addToRecipe()
})

await step('section', 'Now click a line under Details. The Studio ties the selection to the heading: it will read whatever is between Details and Price, however long it is.', async () => {
  await clickLine('This agreement outlines')
  await snap('section-selected')
  await addToRecipe()
})

await step('terms', 'Terms is the last section and runs over the page break. With no heading after it, it reads everything below, and leaves the running header and footer out.', async () => {
  await clickLine('1. Operational Compliance')
  await snap('terms-selected')
  await addToRecipe()
})

await step('table', 'For the price table, pick the Header row mode and click its header, then the Last row mode and click the heading that follows the table.', async () => {
  await page.getByRole('button', { name: 'Header row' }).click()
  await clickLine('Service Tier')
  await page.getByRole('button', { name: 'Last row (until)' }).click()
  await clickLine('TERMS')
  await snap('table-picked')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
})

await step('steps', 'This is the recipe so far: a request, three values by label, two sections and a table. There is no position anywhere in it.', async () => {
  await page.getByRole('button', { name: 'Steps', exact: true }).click()
  await page.waitForTimeout(500)
  await snap('steps')
})

await step('record', 'On the Record tab, the Studio proposes one output field for each value read. A recipe with no Emit step returns nothing, so it offers to add one.', async () => {
  await page.getByRole('button', { name: 'Record', exact: true }).last().click()
  await page.waitForTimeout(500)
  await snap('record-proposals')
  await page.getByRole('button', { name: 'Add Emit step' }).click()
  await page.getByRole('button', { name: /Add all/ }).click()
  await page.waitForTimeout(400)
})

await step('rename', 'The table came out as a list of rows. Rename its field to tiers, then save.', async () => {
  const handle = await page.evaluateHandle(() => [...document.querySelectorAll('input')].find(input => input.value === 'table'))
  const element = handle.asElement()
  if (element !== null) {
    await element.fill('tiers')
    await element.press('Tab')
  }
  await page.waitForTimeout(300)
  await snap('record-fields')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(800)
})

await step('run', 'Run the sample. One record comes out: the reference, the status, the description, the terms in order, and the price tiers.', async () => {
  await page.getByRole('button', { name: 'Run sample' }).click()
  await page.getByRole('tab', { name: /Records/ }).click()
  await page.getByRole('button', { name: 'JSONL' }).first().click()
  await page.waitForTimeout(4000)
  await snap('run-first-document')
})

await step('json', 'This is the input recipe the Studio wrote. Every step is anchored on a heading or a label.', async () => {
  await page.getByRole('button', { name: 'JSON', exact: true }).click()
  await page.waitForTimeout(700)
  await snap('input-recipe-json')
})

await step('second', 'Now load the second document. It looks different: two columns, other letter case, a different header and footer. The recipe is the same.', async () => {
  await page.getByRole('button', { name: 'Steps', exact: true }).click()
  await loadDocument(join(sources, 'agreement-two-columns.pdf'))
  await page.waitForTimeout(3500)
  await snap('second-document')
})

await step('run2', 'Run the sample again. The details come out in reading order across both columns, the terms run over the page break, and the footer stays out of the table.', async () => {
  await page.getByRole('button', { name: 'Run sample' }).click()
  await page.getByRole('tab', { name: /Records/ }).click()
  await page.waitForTimeout(4000)
  await snap('run-second-document')
})

await step('outro', 'One recipe, two documents. When a document changes its look, the recipe keeps reading it by its structure.', async () => {
  await page.waitForTimeout(200)
})

await context.close()
const videoFile = join(work, 'video', readdirSync(join(work, 'video'))[0])
await browser.close()
server.kill()

// -- video + voice ----------------------------------------------------------------------------------------------
const output = join(shots, 'pdf-agreements.mp4')
const inputs = ['-i', videoFile, ...timeline.flatMap(entry => ['-i', entry.wav])]
const delays = timeline.map((entry, index) => `[${index + 1}:a]adelay=${entry.from}|${entry.from}[a${index}]`)
const mix = `${timeline.map((_, index) => `[a${index}]`).join('')}amix=inputs=${timeline.length}:normalize=0[voice]`
execFileSync(FFMPEG, ['-y', ...inputs, '-filter_complex', `${delays.join(';')};${mix}`, '-map', '0:v', '-map', '[voice]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '96k', '-shortest', output], { stdio: 'inherit' })
console.log(`video: ${output} (${Math.round(statSync(output).size / 1024)} KiB)`)
console.log(`screenshots: ${shots}`)
