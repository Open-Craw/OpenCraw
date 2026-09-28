import type { PageDataFindingView } from '@opencraw/studio'
import { pageDataPickNodes } from './pick-from-finding.mapper'

describe('pageDataPickNodes', () => {
  it('builds a plain attribute Read for a meta pick', () => {
    const finding: PageDataFindingView = { kind: 'meta', label: 'meta: description', selector: 'meta', selectorKind: 'css', matches: 1, attribute: 'content' }
    const [card, ...rest] = pageDataPickNodes(finding, 'steps.0', undefined)
    expect(rest).toHaveLength(0)
    expect(card.step).toEqual({ type: 'extract', id: 'data', selector: 'meta', kind: 'css', take: 'attr:content' })
  })

  it('builds a plain attribute Read for a link pick', () => {
    const finding: PageDataFindingView = { kind: 'link', label: 'link: canonical', selector: 'link', selectorKind: 'css', matches: 1, attribute: 'href' }
    const [card] = pageDataPickNodes(finding, 'steps.0', undefined)
    expect(card.step).toMatchObject({ take: 'attr:href' })
  })

  it('builds one take: json Read for a ld-json pick with no key', () => {
    const finding: PageDataFindingView = { kind: 'ld-json', label: 'ld+json: Product', selector: 'html > head > script', selectorKind: 'css', matches: 1, keys: ['name', 'price'] }
    const [card, ...rest] = pageDataPickNodes(finding, 'steps.0', undefined)
    expect(rest).toHaveLength(0)
    expect(card.step).toEqual({ type: 'extract', id: 'data', selector: 'html > head > script', kind: 'css', take: 'json' })
  })

  it('builds the take: json Read plus a jsonpath card when a specific key was picked', () => {
    const finding: PageDataFindingView = { kind: 'ld-json', label: 'ld+json: Product', selector: 'html > head > script', selectorKind: 'css', matches: 1, keys: ['name', 'price'] }
    const [raw, drill] = pageDataPickNodes(finding, 'steps.0', 'price')
    expect(raw.step).toEqual({ type: 'extract', id: 'data', selector: 'html > head > script', kind: 'css', take: 'json' })
    expect(drill.step).toEqual({ type: 'extract', id: 'data_price', from: 'data', selector: '$.price', kind: 'jsonpath' })
    expect(drill.path).toBe('steps.1')
  })

  it('reads the same json+jsonpath shape for an inline-state pick', () => {
    const finding: PageDataFindingView = { kind: 'inline-state', label: '__NEXT_DATA__', selector: 'html > body > script', selectorKind: 'css', matches: 1, keys: ['props'] }
    const [raw, drill] = pageDataPickNodes(finding, 'steps.2', 'props', 'state')
    expect(raw.step).toMatchObject({ id: 'state', take: 'json' })
    expect(drill.step).toMatchObject({ id: 'state_props', from: 'state', selector: '$.props', kind: 'jsonpath' })
  })
})
