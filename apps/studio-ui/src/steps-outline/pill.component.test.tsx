import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { PILL_DRAG_MIME, Pill } from './pill.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

describe('Pill', () => {
  it('is draggable by default and carries its name as the drag payload', () => {
    renderWithChakra(<Pill name='price' />)
    const pill = screen.getByText('price')
    expect(pill.getAttribute('draggable')).toBe('true')

    const setData = jest.fn()
    fireEvent.dragStart(pill, { dataTransfer: { setData, effectAllowed: '' } })

    expect(setData).toHaveBeenCalledWith(PILL_DRAG_MIME, 'price')
    expect(setData).toHaveBeenCalledWith('text/plain', 'price')
  })

  it('is not draggable when draggable={false}', () => {
    renderWithChakra(<Pill name='price' draggable={false} />)
    expect(screen.getByText('price').getAttribute('draggable')).toBe('false')
  })
})
