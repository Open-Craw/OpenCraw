import { chromium } from 'playwright'

/** How the browser that prints the page is found. */
export interface PdfBrowserOptions {
  /** A browser to use instead of Playwright's own Chromium. */
  executablePath?: string
}

/**
 * Prints the report page to a PDF with a browser, so the PDF looks exactly like the HTML page does on paper (A4, landscape, the header row repeated
 * on every page). Needs a Chromium, as a crawl in `web` mode does: Playwright's own, or `executablePath`.
 *
 * @param html - The report page.
 * @param options - Which browser.
 * @returns The PDF's bytes.
 */
export async function pdfFromHtml (html: string, options: PdfBrowserOptions = {}): Promise<Uint8Array> {
  const browser = await chromium.launch({ headless: true, executablePath: options.executablePath })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })

    return await page.pdf({ format: 'A4', landscape: true, printBackground: true, margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' } })
  } finally {
    await browser.close()
  }
}
