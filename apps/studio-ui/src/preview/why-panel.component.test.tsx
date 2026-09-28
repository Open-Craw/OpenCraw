import { render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { WhyPanel } from './why-panel.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

describe('WhyPanel', () => {
  it('shows a placeholder before anything has been clicked', () => {
    renderWithChakra(<WhyPanel />)
    expect(screen.getByText(/click a missing or rejected value/i)).toBeTruthy()
  })

  it('shows a loading state', () => {
    renderWithChakra(<WhyPanel loading />)
    expect(screen.getByText(/working it out/i)).toBeTruthy()
  })

  it('shows an error', () => {
    renderWithChakra(<WhyPanel error='no finished sample run for "books" yet' />)
    expect(screen.getByText(/no finished sample run/i)).toBeTruthy()
  })

  it('shows the sentence, outcome, policy and step for a view', () => {
    renderWithChakra(<WhyPanel view={{ sentence: '"price" is missing: no step in this recipe binds "value".', field: 'price', recipeId: 'books', outcome: 'missing', policy: 'null', stepPath: 'steps.1' }} />)
    expect(screen.getByText(/"price" is missing/)).toBeTruthy()
    expect(screen.getByText('missing')).toBeTruthy()
    expect(screen.getByText('price')).toBeTruthy()
    expect(screen.getByText(/policy: null/)).toBeTruthy()
    expect(screen.getByText(/step: steps\.1/)).toBeTruthy()
  })
})
