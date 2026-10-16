import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import { NextStepHint } from './next-step-hint.component'

describe('NextStepHint', () => {
  it('says that nothing is collected yet, and the three things to do', () => {
    render(<ChakraProvider value={defaultSystem}><NextStepHint /></ChakraProvider>)

    expect(screen.getByText('Nothing is collected yet')).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/Pick what you want.*two similar things.*Run sample/)
  })
})
