import { chosenPick, collectsMany, groupsOf, headingFor, hintFor, manyChoice, stagePick } from './web-pick-staging.mapper'
import type { WebPick } from './web-pick-staging.mapper'

const FIELD: WebPick = {
  kind:  'field',
  field: {
    selector:     'p.price',
    tier:         'class',
    take:         'text',
    matches:      3,
    alternatives: [
      { selector: 'p.price', tier: 'class', matches: 3 },
      { selector: '.card > p.price', tier: 'structure', matches: 3 },
      { selector: 'div > p:nth-of-type(2)', tier: 'position', matches: 1 },
    ],
    generatedId: 'ember91',
  },
}
const LIST: WebPick = {
  kind:  'list',
  item:  { selector: 'li.card', tier: 'class', matches: 12, alternatives: [{ selector: 'li.card', tier: 'class', matches: 12 }, { selector: 'ul > li', tier: 'structure', matches: 12 }] },
  field: { selector: 'p.price', tier: 'class', take: 'text', matches: 12, alternatives: [{ selector: 'p.price', tier: 'class', matches: 12 }] },
}

describe('stagePick', () => {
  it('starts with the suggested selectors chosen and remembers what was clicked', () => {
    expect(stagePick(FIELD, '9.99')).toEqual({ pick: FIELD, fieldSelector: 'p.price', text: '9.99' })
    expect(stagePick(LIST)).toEqual({ pick: LIST, fieldSelector: 'p.price', itemSelector: 'li.card' })
  })
})

describe('chosenPick', () => {
  it('writes the selector the person chose, with its own match count', () => {
    const staged = { ...stagePick(FIELD), fieldSelector: '.card > p.price' }

    expect(chosenPick(staged)).toMatchObject({ kind: 'field', field: { selector: '.card > p.price', matches: 3, take: 'text' } })
  })

  it('keeps the suggested count for a selector typed by hand', () => {
    const staged = { ...stagePick(FIELD), fieldSelector: '.mine' }

    expect(chosenPick(staged)).toMatchObject({ field: { selector: '.mine', matches: 3 } })
  })

  it('chooses the items and the value of a list apart', () => {
    const staged = { ...stagePick(LIST), itemSelector: 'ul > li' }

    expect(chosenPick(staged)).toMatchObject({ kind: 'list', item: { selector: 'ul > li', matches: 12 }, field: { selector: 'p.price' } })
  })
})

describe('collecting every match as an array', () => {
  it('is a choice only for a single value whose chosen selector matches several elements', () => {
    expect(manyChoice(stagePick(FIELD))).toBe(3)
    expect(manyChoice({ ...stagePick(FIELD), fieldSelector: 'div > p:nth-of-type(2)' })).toBeUndefined()
    expect(manyChoice(stagePick(LIST))).toBeUndefined()
  })

  it('collects all only when asked for, and not once the chosen selector matches just one', () => {
    expect(collectsMany(stagePick(FIELD))).toBe(false)
    expect(collectsMany({ ...stagePick(FIELD), many: true })).toBe(true)
    expect(collectsMany({ ...stagePick(FIELD), many: true, fieldSelector: 'div > p:nth-of-type(2)' })).toBe(false)
  })
})

describe('groupsOf', () => {
  it('offers one choice for a value, with the generated id named', () => {
    const [group, ...others] = groupsOf(stagePick(FIELD))

    expect(others).toHaveLength(0)
    expect(group).toMatchObject({ title: 'How to find it', target: 'field', selected: 'p.price', generatedId: 'ember91' })
    expect(group.options).toHaveLength(3)
  })

  it('offers the items and the value for a list', () => {
    expect(groupsOf(stagePick(LIST)).map(group => [group.target, group.title])).toEqual([['item', 'Each item of the list'], ['field', 'Value in each item']])
  })

  it('falls back to the suggested selector when the server sent no alternatives', () => {
    const bare: WebPick = { kind: 'field', field: { selector: 'h1', tier: 'structure', take: 'text', matches: 1 } }

    expect(groupsOf(stagePick(bare))[0].options).toEqual([{ selector: 'h1', tier: 'structure', matches: 1 }])
  })
})

describe('headingFor and hintFor', () => {
  it('say what adding does and what else can be done', () => {
    expect(headingFor(stagePick(FIELD))).toBe('Collect this value')
    expect(headingFor(stagePick(LIST))).toBe('Collect this for every one of the 12 items')
    expect(hintFor(stagePick(FIELD))).toContain('similar item')
    expect(hintFor(stagePick({ kind: 'item-field', field: FIELD.field }))).toBeUndefined()
  })
})
