import type { DeckDocument, PdfDocument } from '@opencraw/core'
import { previewRegion } from './region-preview.use-case'

const pdf: PdfDocument = {
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

const title = { x: 60, y: 30, width: 840, height: 60, text: 'Incentivi giugno', placeholder: 'title' }
const body = { x: 60, y: 120, width: 840, height: 300, text: 'Fonte: UNRAE' }
const deck: DeckDocument = {
  kind:   'deck',
  width:  960,
  height: 540,
  slides: [
    { number: 1, title: 'Incentivi giugno', hidden: false, shapes: [title, body], tables: [], charts: [], notes: '' },
    { number: 2, title: 'Bozza', hidden: true, shapes: [{ ...title, text: 'Bozza' }], tables: [], charts: [], notes: '' },
  ],
}

describe('previewRegion', () => {
  it('answers the engine\'s own matches for a PDF selector: the text and the cells it was read from, no shapes', () => {
    const preview = previewRegion(pdf, 'page=1 x=60..130 y=775..815')
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toEqual([{ page: 1, text: 'Title\nLabel', cells: [{ x: 72, y: 800, width: 50, height: 10, text: 'Title' }, { x: 72, y: 780, width: 50, height: 10, text: 'Label' }], shapes: [] }])
  })

  it('answers the engine\'s own matches for a deck selector: the slide as page, the text and the boxes it was read from, no cells', () => {
    const preview = previewRegion(deck, 'slide=1 x=0..960 y=0..100')
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toEqual([{ page: 1, text: 'Incentivi giugno', cells: [], shapes: [title] }])
    expect(previewRegion(deck, 'slide=* x=0..960 y=0..100').matches.map(match => match.page)).toEqual([1])
  })

  it('reports a selector that does not parse as error, with no matches, rather than throwing', () => {
    const preview = previewRegion(pdf, 'page=1 x=60..130')
    expect(preview.matches).toEqual([])
    expect(preview.error).toMatch(/page=<number\|\*>/)
  })

  it('reports the other document\'s keyword as error: a slide= on a PDF, a page= on a deck', () => {
    expect(previewRegion(pdf, 'slide=1 x=60..130 y=775..815')).toEqual({ matches: [], error: 'region: "slide=" reads a deck; this document is a PDF (name a "page=")' })
    expect(previewRegion(deck, 'page=1 x=0..960 y=0..100')).toEqual({ matches: [], error: 'region: "page=" reads a PDF; this document is a deck (name a "slide=")' })
  })

  it('answers no matches, and no error, for a box with nothing in it', () => {
    expect(previewRegion(pdf, 'page=1 x=400..500 y=100..200')).toEqual({ matches: [] })
    expect(previewRegion(deck, 'slide=1 x=900..960 y=500..540')).toEqual({ matches: [] })
  })
})
