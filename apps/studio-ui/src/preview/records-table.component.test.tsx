import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { RecordsTable } from './records-table.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

describe('RecordsTable', () => {
  it('calls onCellClick with the record index and field for a null cell', () => {
    const onCellClick = jest.fn()
    renderWithChakra(<RecordsTable records={[{ key: 'a', data: { name: 'Widget', price: null } }]} onCellClick={onCellClick} />)

    fireEvent.click(screen.getByText('null'))

    expect(onCellClick).toHaveBeenCalledWith(0, 'price')
  })

  it('says so when records were emitted but no output field is mapped, instead of an empty table', () => {
    renderWithChakra(<RecordsTable records={[{ key: null, data: {} }, { key: null, data: {} }]} />)
    expect(screen.getByText(/2 records emitted, but no output field is mapped yet/)).toBeTruthy()
  })

  it('does not make a null cell clickable without onCellClick', () => {
    renderWithChakra(<RecordsTable records={[{ key: 'a', data: { price: null } }]} />)
    const cell = screen.getByText('null')
    expect(cell.getAttribute('title')).not.toBe('Why is this missing?')
  })

  it('reports hovering a column header as that field, on enter and undefined on leave (issue #111)', () => {
    const onHoverField = jest.fn()
    renderWithChakra(<RecordsTable records={[{ key: 'a', data: { name: 'Widget', price: 3 } }]} onHoverField={onHoverField} />)
    const header = screen.getByText('price')
    fireEvent.mouseEnter(header)
    expect(onHoverField).toHaveBeenCalledWith('price')
    fireEvent.mouseLeave(header)
    expect(onHoverField).toHaveBeenCalledWith(undefined)
  })

  it('highlights the header and every cell of the currently highlighted field', () => {
    renderWithChakra(<RecordsTable records={[{ key: 'a', data: { name: 'Widget', price: 3 } }]} highlightedField='price' />)
    expect(screen.getByText('price').dataset.highlighted).toBe('true')
    expect(screen.getByText('3').dataset.highlighted).toBe('true')
    expect(screen.getByText('name').dataset.highlighted).toBe('false')
  })
})
