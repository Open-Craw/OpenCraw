import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { PreviewStrip } from './preview-strip'

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
})
