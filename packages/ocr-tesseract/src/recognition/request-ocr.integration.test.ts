import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HttpClient } from '@opencraw/core'

const scan = pathToFileURL(join(__dirname, '..', '..', '..', 'core', 'src', 'pdf-ocr', 'fixtures', 'scan-clean.pdf')).href

describe('a request for a scanned PDF with "ocr"', () => {
  it('reads the scan through the installed engine and stops its workers', async () => {
    const client = await HttpClient.open()
    try {
      const response = await client.send({ url: scan, ocr: true })

      expect(response.format).toBe('pdf')
      expect(response.body.kind).toBe('pdf')
      const text = response.body.kind === 'pdf' ? response.body.pages.flatMap(page => page.rows).map(row => row.cells.map(cell => cell.text).join(' ')).join('\n') : ''
      expect(text).toContain('Totale ordini')
      expect(text).toContain('24950')
    } finally {
      await client.dispose()
    }
  }, 60_000)

  it('says what is wrong when the request does not ask for OCR', async () => {
    const client = await HttpClient.open()
    try {
      await expect(client.send({ url: scan })).rejects.toThrow('ocr')
    } finally {
      await client.dispose()
    }
  }, 60_000)
})
