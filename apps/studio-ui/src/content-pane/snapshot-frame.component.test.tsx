import { fireEvent, render } from '@testing-library/react'
import { SnapshotFrame } from './snapshot-frame.component'

const BODY = '<a href="https://x.test/p" data-oc-node="n1">Product</a>'

/** jsdom does not load a `srcDoc`: put the document in by hand and fire the `load` a browser would. */
function loadedLink (container: HTMLElement): HTMLAnchorElement {
  const iframe = container.querySelector('iframe') as HTMLIFrameElement
  const doc = iframe.contentDocument as Document
  doc.body.innerHTML = BODY
  fireEvent.load(iframe)

  return doc.querySelector('a') as HTMLAnchorElement
}

describe('SnapshotFrame', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'CSS', { value: { escape: (text: string) => text }, configurable: true }) // jsdom has none, and the frame escapes its node attribute with it
  })

  it('picks a clicked element in pick mode, though its elements come from the iframe realm (issue #153)', () => {
    const onPickNode = jest.fn()
    const { container } = render(<SnapshotFrame html={BODY} pickMode showHidden={false} onHoverNode={() => undefined} onPickNode={onPickNode} />)

    fireEvent.click(loadedLink(container))

    expect(onPickNode).toHaveBeenCalledWith('n1')
  })

  it('does not pick outside pick mode', () => {
    const onPickNode = jest.fn()
    const { container } = render(<SnapshotFrame html={BODY} pickMode={false} showHidden={false} onHoverNode={() => undefined} onPickNode={onPickNode} />)

    fireEvent.click(loadedLink(container))

    expect(onPickNode).not.toHaveBeenCalled()
  })
})
