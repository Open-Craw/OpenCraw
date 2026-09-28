import { render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { ContentPane } from './content-pane'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

describe('ContentPane', () => {
  it('shows a placeholder before anything has been fetched', () => {
    renderWithChakra(<ContentPane />)
    expect(screen.getByText(/run a sample/i)).toBeTruthy()
  })

  it('shows the fetched HTML as text', () => {
    renderWithChakra(<ContentPane html='<h1>Books</h1>' />)
    expect(screen.getByText('<h1>Books</h1>')).toBeTruthy()
  })
})
