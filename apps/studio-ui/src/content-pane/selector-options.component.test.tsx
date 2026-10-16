import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createStudioQueryClient } from '../studio-client'
import { SelectorOptions } from './selector-options.component'

const OPTIONS = [
  { selector: 'p.price', tier: 'class' as const, matches: 3 },
  { selector: '.card > p.price', tier: 'structure' as const, matches: 1 },
]

function show (overrides: Partial<React.ComponentProps<typeof SelectorOptions>> = {}): { onSelect: jest.Mock, onAdd: jest.Mock, onCancel: jest.Mock } {
  const onSelect = jest.fn()
  const onAdd = jest.fn()
  const onCancel = jest.fn()
  render(
    <QueryClientProvider client={createStudioQueryClient()}>
      <ChakraProvider value={defaultSystem}>
        <SelectorOptions
          recipeId='r'
          stepPath='steps.0'
          heading='Collect this value'
          preview='9.99'
          groups={[{ title: 'How to find it', options: OPTIONS, selected: 'p.price', onSelect, generatedId: 'ember91' }]}
          onAdd={onAdd}
          onCancel={onCancel}
          {...overrides}
        />
      </ChakraProvider>
    </QueryClientProvider>,
  )

  return { onSelect, onAdd, onCancel }
}

describe('SelectorOptions', () => {
  it('lists every way to find the element, with how many it matches, the first as suggested', () => {
    show()

    expect(screen.getByText('p.price')).toBeTruthy()
    expect(screen.getByText('.card > p.price')).toBeTruthy()
    expect(screen.getByText('3 matches')).toBeTruthy()
    expect(screen.getByText('1 match')).toBeTruthy()
    expect(screen.getByText('suggested')).toBeTruthy()
    expect(screen.getByText('“9.99”')).toBeTruthy()
  })

  it('says why an id that looks generated is not offered', () => {
    show()

    expect(screen.getByText(/ember91/)).toBeTruthy()
  })

  it('reports the way the person chooses, and adds or cancels only on request', () => {
    const { onSelect, onAdd, onCancel } = show()

    fireEvent.click(screen.getByRole('radio', { name: /card > p\.price/ }))
    expect(onSelect).toHaveBeenCalledWith('.card > p.price')
    expect(onAdd).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Add to recipe' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel this pick' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('asks whether to collect the first match or all of them when the selector matches several', () => {
    const onChange = jest.fn()
    show({ collect: { matches: 3, many: false, onChange } })

    expect(screen.getByText(/This matches 3 elements/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /All 3, as a list/ }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('shows no such question when there is nothing to choose', () => {
    show()

    expect(screen.queryByText(/This matches/)).toBeNull()
  })

  it('uses a selector the person types', () => {
    const { onSelect } = show()

    fireEvent.change(screen.getByLabelText('Your own selector'), { target: { value: '  .mine > span ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))

    expect(onSelect).toHaveBeenCalledWith('.mine > span')
  })
})
