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

  it('does not make a null cell clickable without onCellClick', () => {
    renderWithChakra(<RecordsTable records={[{ key: 'a', data: { price: null } }]} />)
    const cell = screen.getByText('null')
    expect(cell.getAttribute('title')).not.toBe('Why is this missing?')
  })
})
