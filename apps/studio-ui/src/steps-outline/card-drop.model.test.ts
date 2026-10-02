import type { OutlineNode } from '@opencraw/studio'
import { CARD_DRAG_MIME, cardDragData, carriesCard, droppedCard } from './card-drop.model'

const card: OutlineNode = { kind: 'card', path: 'steps.0', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'title', kind: 'region', selector: 'page=1 x=71..273 y=799..813' } }

function transfer (data: Record<string, string>): DataTransfer {
  return { types: Object.keys(data), getData: (type: string) => data[type] ?? '' } as unknown as DataTransfer
}

describe('card drag payload (issue #121)', () => {
  it('round-trips a node through the drag payload', () => {
    const payload = transfer({ [CARD_DRAG_MIME]: cardDragData(card) })
    expect(droppedCard(payload)).toEqual(card)
  })

  it('answers nothing for a drag that carries no card, or a payload that is not a node', () => {
    expect(droppedCard(transfer({ 'text/plain': 'title' }))).toBeUndefined()
    expect(droppedCard(transfer({ [CARD_DRAG_MIME]: '{"kind":"pill"}' }))).toBeUndefined()
    expect(droppedCard(transfer({ [CARD_DRAG_MIME]: 'not json' }))).toBeUndefined()
  })

  it('tells a card drag from any other by its MIME type alone', () => {
    expect(carriesCard(transfer({ [CARD_DRAG_MIME]: '' }))).toBe(true)
    expect(carriesCard(transfer({ 'application/x-opencraw-pill': 'title' }))).toBe(false)
  })
})
