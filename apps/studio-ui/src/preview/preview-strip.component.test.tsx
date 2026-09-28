import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { PreviewStrip } from './preview-strip.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

const RECORDS = [
  { key: 'a1', data: { name: 'Widget', price: 9.5 } },
  { key: 'a2', data: { name: 'Gadget' } },
]
const TRACE = ['▶ products (api)', '■ products: 2 emitted, 0 rejected, 0 duplicates, 1 pages, 12 ms']

describe('PreviewStrip', () => {
  it('shows the Records tab with one column per field and missing values marked', () => {
    renderWithChakra(<PreviewStrip records={RECORDS} traceLines={[]} />)
    expect(screen.getByText('Widget')).toBeTruthy()
    expect(screen.getByText('Gadget')).toBeTruthy()
    expect(screen.getByText('missing')).toBeTruthy()
    expect(screen.getByText('Records (2)')).toBeTruthy()
  })

  it('shows the streamed trace on the Trace tab', () => {
    renderWithChakra(<PreviewStrip records={[]} traceLines={TRACE} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Trace' }))
    expect(screen.getByText(/2 emitted, 0 rejected/)).toBeTruthy()
  })

  it('shows placeholders when nothing has run yet', () => {
    renderWithChakra(<PreviewStrip records={[]} traceLines={[]} />)
    expect(screen.getByText(/no records yet/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Trace' }))
    expect(screen.getByText(/no trace yet/i)).toBeTruthy()
  })

  it('clicking a missing (null) cell calls onExplainMissing with the record index and field, and the Why? tab shows the answer once it arrives', () => {
    const recordsWithNull = [{ key: 'a1', data: { name: 'Widget', price: 9.5 } }, { key: 'a2', data: { name: 'Gadget', price: null } }]
    const onExplainMissing = jest.fn()
    const { rerender } = renderWithChakra(
      <PreviewStrip records={recordsWithNull} traceLines={[]} onExplainMissing={onExplainMissing} />,
    )

    fireEvent.click(screen.getByText('null'))
    expect(onExplainMissing).toHaveBeenCalledWith(1, 'price')

    rerender(
      <ChakraProvider value={defaultSystem}>
        <PreviewStrip
          records={recordsWithNull}
          traceLines={[]}
          onExplainMissing={onExplainMissing}
          whyView={{ sentence: '"price" is missing: no step in this recipe binds "value".', field: 'price', recipeId: 'books', outcome: 'missing' }}
        />
      </ChakraProvider>,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Why?' }))
    expect(screen.getByText(/"price" is missing/)).toBeTruthy()
  })

  it('shows the rejected list and calls onExplainRejected with its index', () => {
    const onExplainRejected = jest.fn()
    renderWithChakra(
      <PreviewStrip records={[]} traceLines={[]} rejected={[{ field: 'title', reason: 'missing' }]} onExplainRejected={onExplainRejected} />,
    )

    expect(screen.getByText('Rejected (1)')).toBeTruthy()
    fireEvent.click(screen.getByText('title'))
    expect(onExplainRejected).toHaveBeenCalledWith(0)
  })
})
