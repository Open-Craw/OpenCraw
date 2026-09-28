import { domTree } from './dom-tree.mapper'

function snapshot (body: string): string {
  let n = 0
  const stamped = body.replaceAll(/<([a-z][\w-]*)/gi, (_match, tag: string) => {
    n += 1

    return `<${tag} data-oc-node="n${n}"`
  })

  return `<!doctype html><html data-oc-node="n0"><head></head><body>${stamped}</body></html>`
}

describe('domTree', () => {
  it('builds a node for every element, with its tag, id, classes and attributes (the internal marks stripped)', () => {
    const tree = domTree(snapshot('<div id="app" class="a b"><a href="/x" data-x="1">go</a></div>'))
    const body = tree.children.find(node => node.tag === 'body')
    const div = body?.children[0]
    expect(div).toMatchObject({ tag: 'div', id: 'app', classes: ['a', 'b'] })
    expect(div?.attributes).not.toHaveProperty('data-oc-node')
    const anchor = div?.children[0]
    expect(anchor).toMatchObject({ tag: 'a', text: 'go' })
    expect(anchor?.attributes).toEqual({ 'href': '/x', 'data-x': '1' })
  })

  it('greys a node marked data-oc-hidden by the snapshot', () => {
    const tree = domTree(snapshot('<input data-oc-hidden="1" value="secret">'))
    const input = tree.children.find(n => n.tag === 'body')?.children[0]
    expect(input).toMatchObject({ tag: 'input', hidden: true })
  })

  it('abbreviates a leaf element\'s own text, and leaves an element with element children without one', () => {
    const long = 'x'.repeat(200)
    const tree = domTree(snapshot(`<p>${long}</p><div><span>a</span><span>b</span></div>`))
    const body = tree.children.find(n => n.tag === 'body')
    expect(body?.children[0].text?.length).toBeLessThan(long.length)
    expect(body?.children[0].text?.endsWith('…')).toBe(true)
    expect(body?.children[1].text).toBeUndefined()
  })

  it('collapses a run of 3+ structurally identical siblings into one row with every collapsed id', () => {
    const items = Array.from({ length: 20 }, (_, i) => '<li class="row">item</li>').join('')
    const tree = domTree(snapshot(`<ul>${items}</ul>`))
    const ul = tree.children.find(n => n.tag === 'body')?.children[0]
    expect(ul?.children).toHaveLength(1)
    expect(ul?.children[0]).toMatchObject({ tag: 'li', repeatCount: 20 })
    expect(ul?.children[0].repeatNodeIds).toHaveLength(20)
  })

  it('does not collapse a run shorter than the threshold, and stops a run at the first sibling that differs', () => {
    const tree = domTree(snapshot('<ul><li class="row">same</li><li class="row">same</li><li class="other">different</li></ul>'))
    const ul = tree.children.find(n => n.tag === 'body')?.children[0]
    expect(ul?.children).toHaveLength(3)
    expect(ul?.children.every(node => node.repeatCount === undefined)).toBe(true)
  })
})
