import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { RejectedList } from './rejected-list.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

describe('RejectedList', () => {
  it('renders nothing when there are no rejected records', () => {
    const { container } = renderWithChakra(<RejectedList rejected={[]} />)
    expect(container.textContent).toBe('')
  })

  it('lists each rejected record\'s field and reason', () => {
    renderWithChakra(<RejectedList rejected={[{ field: 'price', reason: 'not a number' }, { field: 'title', reason: 'missing' }]} />)
    expect(screen.getByText('Rejected (2)')).toBeTruthy()
    expect(screen.getByText('price')).toBeTruthy()
    expect(screen.getByText('not a number')).toBeTruthy()
    expect(screen.getByText('title')).toBeTruthy()
  })

  it('calls onClick with the row\'s index', () => {
    const onClick = jest.fn()
    renderWithChakra(<RejectedList rejected={[{ field: 'price', reason: 'x' }, { field: 'title', reason: 'y' }]} onClick={onClick} />)
    fireEvent.click(screen.getByText('title'))
    expect(onClick).toHaveBeenCalledWith(1)
  })
})
