import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import type { OutlineNode, RecipeListing } from '@opencraw/studio'
import { resetStudioUiStore } from '../studio-store'
import { CARD_DRAG_MIME, PILL_DRAG_MIME } from '../steps-outline'
import { RecordEditor } from './record-editor.component'
import type { RecordEditorProps } from './record-editor.component'

function listing (file: string, kind: 'input' | 'output', body: unknown, outline?: RecipeListing['outline']): RecipeListing {
  return { file, kind, id: 'books', issues: [], text: `${JSON.stringify(body, null, 2)}\n`, ...(outline !== undefined && { outline }) }
}

const OUTPUT = listing('/r/books.ocw-out.json', 'output', { kind: 'output', id: 'books', version: 1, fields: {} })

function inputWith (steps: unknown[], mapping: Record<string, unknown> = {}) {
  return { kind: 'input', id: 'books', output: 'books', mode: 'web', start: [{ url: 'https://x/' }], steps, mapping }
}

const STEPS = [{ type: 'goto', url: '{{start.url}}' }, { type: 'extract', id: 'title', kind: 'css', selector: 'h1' }, { type: 'extract', id: 'price', kind: 'css', selector: '.price' }]
const OUTLINE = { steps: [] as OutlineNode[] } as unknown as RecipeListing['outline']

function dataTransfer (entries: Record<string, string>) {
  return { types: Object.keys(entries), getData: (type: string) => entries[type] ?? '', dropEffect: 'none' }
}

function renderEditor (props: Partial<RecordEditorProps> & { input?: RecipeListing } = {}) {
  const { input = listing('/r/books.ocw-in.json', 'input', inputWith(STEPS), OUTLINE), ...rest } = props
  const ui = (current: RecipeListing) => (
    <ChakraProvider value={defaultSystem}>
      <RecordEditor inputRecipe={current} outputRecipe={OUTPUT} records={[]} rejected={[]} onSaveInput={async () => {}} onSaveOutput={async () => {}} {...rest} />
    </ChakraProvider>
  )
  const view = render(ui(input))

  return { ...view, rerenderWith: (next: RecipeListing) => { view.rerender(ui(next)) } }
}

describe('Record tab Emit warning', () => {
  beforeEach(() => { resetStudioUiStore() })

  it('says a run returns no records without an Emit step, and adds one on request', async () => {
    const onSaveInput = jest.fn().mockResolvedValue(undefined)
    renderEditor({ onSaveInput })
    expect(screen.getByTestId('missing-emit')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add Emit step' }))
    expect(screen.queryByTestId('missing-emit')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => { expect(onSaveInput).toHaveBeenCalledTimes(1) })
    expect((onSaveInput.mock.calls[0] as [string, { steps: unknown[] }])[1].steps.at(-1)).toEqual({ type: 'emit' })
  })

  it('stays quiet when the recipe already emits', () => {
    renderEditor({ input: listing('/r/books.ocw-in.json', 'input', inputWith([...STEPS, { type: 'emit' }]), OUTLINE) })

    expect(screen.queryByTestId('missing-emit')).toBeNull()
  })
})

describe('Record tab output drop zone', () => {
  beforeEach(() => { resetStudioUiStore() })

  it('adds a field and its mapping when a pill is dropped on the list, typed as its proposal would be', () => {
    renderEditor()

    fireEvent.drop(screen.getByTestId('output-drop-zone'), { dataTransfer: dataTransfer({ [PILL_DRAG_MIME]: 'price' }) })

    expect(screen.getByTestId('price-row')).toBeTruthy()
    expect(screen.getByTestId('price-source-drop').textContent).toContain('price')
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
  })

  it('maps only the row when a pill is dropped on that row\'s source, and adds no second field', () => {
    renderEditor({ input: listing('/r/books.ocw-in.json', 'input', inputWith(STEPS), OUTLINE) })
    fireEvent.drop(screen.getByTestId('output-drop-zone'), { dataTransfer: dataTransfer({ [PILL_DRAG_MIME]: 'title' }) })
    expect(screen.getAllByTestId(/-row$/)).toHaveLength(1)

    fireEvent.drop(screen.getByTestId('title-source-drop'), { dataTransfer: dataTransfer({ [PILL_DRAG_MIME]: 'price' }) })

    expect(screen.getAllByTestId(/-row$/)).toHaveLength(1)
  })

  it('ignores a drag that carries neither a pill nor a selection', () => {
    renderEditor()

    fireEvent.drop(screen.getByTestId('output-drop-zone'), { dataTransfer: dataTransfer({ 'text/plain': 'price' }) })

    expect(screen.queryAllByTestId(/-row$/)).toHaveLength(0)
  })

  it('appends a dropped selection to the steps and, once they are saved and the recipe reloads, adds its values as fields', async () => {
    const onSaveOutline = jest.fn().mockResolvedValue(undefined)
    const card: OutlineNode = { kind: 'card', path: 'steps.0', step: { type: 'extract', id: 'rating', kind: 'css', selector: '.star' } } as unknown as OutlineNode
    const { rerenderWith } = renderEditor({ onSaveOutline })

    fireEvent.drop(screen.getByTestId('output-drop-zone'), { dataTransfer: dataTransfer({ [CARD_DRAG_MIME]: JSON.stringify(card) }) })

    await waitFor(() => { expect(onSaveOutline).toHaveBeenCalledTimes(1) })
    expect(onSaveOutline.mock.calls[0]).toEqual(['/r/books.ocw-in.json', { steps: [{ ...card, path: 'steps.0' }] }])
    expect(screen.queryByTestId('rating-row')).toBeNull()

    // The server wrote the steps; the workspace reloads the recipe with them.
    rerenderWith(listing('/r/books.ocw-in.json', 'input', inputWith([...STEPS, card.step]), OUTLINE))

    await waitFor(() => { expect(screen.getByTestId('rating-row')).toBeTruthy() })
  })
})
