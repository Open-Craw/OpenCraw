// Writes the scanned-PDF fixtures the OCR tests read into src/pdf-ocr/fixtures/: one-page PDFs whose only content is a JPEG of text, what a scanner makes. They have no
// text layer. The text is drawn with the system's sans-serif font, so run this on a machine that has one, then commit the files: the tests read them, they do not make them.
// Run: node tools/make-scanned-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas } from '@napi-rs/canvas'

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', 'src', 'pdf-ocr', 'fixtures')
mkdirSync(target, { recursive: true })

/** A one-page PDF with one JPEG filling it. */
function pdfWithJpeg (jpeg, width, height, pageWidth, pageHeight) {
  const parts = []
  const offsets = []
  let length = 0
  const push = (chunk) => {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'latin1') : chunk
    parts.push(buffer)
    length += buffer.length
  }
  const object = (number, body) => {
    offsets[number] = length
    push(`${number} 0 obj\n${body}\nendobj\n`)
  }
  push('%PDF-1.4\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  offsets[4] = length
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  push(jpeg)
  push('\nendstream\nendobj\n')
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  const xref = length
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(number => `${String(offsets[number]).padStart(10, '0')} 00000 n \n`).join('')}`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  return Buffer.concat(parts)
}

/** Draws lines of text on a sheet and scans it: `tiltDegrees` is how crooked the paper went in, `noise` (0 to 1) the scanner's grain. */
function scan ({ lines, pageWidth = 420, pageHeight = 595, pixelsPerPoint = 2.5, fontPoints = 14, tiltDegrees = 0, noise = 0, shade = 0, quality = 70 }) {
  const width = Math.round(pageWidth * pixelsPerPoint)
  const height = Math.round(pageHeight * pixelsPerPoint)
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  // Paper that is darker at one side, as a scan near a book's spine is: `shade` is how many levels darker.
  const paper = context.createLinearGradient(0, 0, width, 0)
  paper.addColorStop(0, `rgb(${246 - shade}, ${243 - shade}, ${236 - shade})`)
  paper.addColorStop(1, '#f6f3ec')
  context.fillStyle = paper
  context.fillRect(0, 0, width, height)
  context.save()
  context.translate(width / 2, height / 2)
  context.rotate((tiltDegrees * Math.PI) / 180)
  context.translate(-width / 2, -height / 2)
  context.fillStyle = '#1c1c1c'
  const size = fontPoints * pixelsPerPoint
  context.font = `${size}px sans-serif`
  for (const [index, line] of lines.entries()) context.fillText(line, 40 * pixelsPerPoint, (70 * pixelsPerPoint) + (index * size * 1.9))
  context.restore()
  if (noise > 0) {
    const image = context.getImageData(0, 0, width, height)
    // A fixed sequence, so the fixture is the same file every time it is made.
    let seed = 12_345
    const random = () => {
      seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0

      return seed / 4_294_967_296
    }
    for (let at = 0; at < image.data.length; at += 4) {
      const shift = Math.round((random() - 0.5) * 110 * noise)
      for (let channel = 0; channel < 3; channel += 1) image.data[at + channel] = Math.min(255, Math.max(0, image.data[at + channel] + shift))
    }
    context.putImageData(image, 0, 0)
  }

  return pdfWithJpeg(canvas.toBuffer('image/jpeg', quality), width, height, pageWidth, pageHeight)
}

const TABLE = ['Incentivi giugno 2026', 'Marca     Modello     Prezzo    Sconto', 'Fiat      Pandina     15950     12,5%', 'Jeep      Avenger     24950     8,0%', 'Totale ordini: 1.250']

const fixtures = {
  'scan-clean.pdf': scan({ lines: TABLE }),
  'scan-poor.pdf':  scan({ lines: TABLE, pixelsPerPoint: 2, tiltDegrees: 2.2, noise: 0.5 }),
  // 200 dpi, fed in 4.5 degrees crooked, with shaded paper: read as it is, Tesseract finds nothing; cleaned, every character.
  'scan-crooked-shaded.pdf': scan({ lines: TABLE, pageHeight: 300, pixelsPerPoint: 2.8, fontPoints: 10, tiltDegrees: 4.5, noise: 0.5, shade: 60, quality: 60 }),
}
for (const [name, bytes] of Object.entries(fixtures)) {
  writeFileSync(join(target, name), bytes)
  console.log(`wrote ${name} (${bytes.length} bytes)`)
}
