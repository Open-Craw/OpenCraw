import { takeKindFor } from './take-kind.policy'
import type { DomPathLevel } from './dom-path.model'

function level (tag: string, attrs: Record<string, string> = {}): DomPathLevel {
  return { tag, classes: [], attrs, index: 1, siblingCount: 1 }
}

describe('takeKindFor', () => {
  it('defaults to text', () => {
    expect(takeKindFor(level('p'))).toBe('text')
  })

  it('reads href off a link', () => {
    expect(takeKindFor(level('a', { href: '/x' }))).toBe('attr:href')
  })

  it('reads src off an image, falling back to alt', () => {
    expect(takeKindFor(level('img', { src: '/x.jpg' }))).toBe('attr:src')
    expect(takeKindFor(level('img', { alt: 'A cat' }))).toBe('attr:alt')
  })

  it('reads the first real data-* attribute, ignoring the snapshot\'s own stamps', () => {
    expect(takeKindFor(level('span', { 'data-oc-node': 'n1', 'data-oc-hidden': '1', 'data-id': '42' }))).toBe('attr:data-id')
  })

  it('reads json for an application/json script tag', () => {
    expect(takeKindFor(level('script', { type: 'application/json' }))).toBe('json')
    expect(takeKindFor(level('script', { type: 'text/javascript' }))).toBe('text')
  })
})
