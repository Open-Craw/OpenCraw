import type { PdfDocument } from '@opencraw/core'
import { previewPdfRegion } from './region-preview.use-case'

const document: PdfDocument = {
  kind:  'pdf',
  pages: [{
    number: 1,
    width:  595,
    height: 842,
    rows:   [
      { top: 810, bottom: 800, text: 'Title', cells: [{ x: 72, y: 800, width: 50, height: 10, text: 'Title' }] },
      { top: 790, bottom: 780, text: 'Label\tValue', cells: [{ x: 72, y: 780, width: 50, height: 10, text: 'Label' }, { x: 300, y: 780, width: 50, height: 10, text: 'Value' }] },
    ],
  }],
}

describe('previewPdfRegion', () => {
  it('answers the engine\'s own matches for a selector: the text and the cells it was read from', () => {
    const preview = previewPdfRegion(document, 'page=1 x=60..130 y=775..815')
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toEqual([{ page: 1, text: 'Title\nLabel', cells: [{ x: 72, y: 800, width: 50, height: 10, text: 'Title' }, { x: 72, y: 780, width: 50, height: 10, text: 'Label' }] }])
  })

  it('reports a selector that does not parse as error, with no matches, rather than throwing', () => {
    const preview = previewPdfRegion(document, 'page=1 x=60..130')
    expect(preview.matches).toEqual([])
    expect(preview.error).toMatch(/page=<number\|\*>/)
  })

  it('answers no matches, and no error, for a box with nothing in it', () => {
    expect(previewPdfRegion(document, 'page=1 x=400..500 y=100..200')).toEqual({ matches: [] })
  })
})
