import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { HookNameField } from './hook-name-field.component'
import { HookNamesContext } from './hook-names.hook'

function renderField (names: readonly string[] | undefined, value: string, onChange = jest.fn(), onCommit = jest.fn()) {
  render(
    <ChakraProvider value={defaultSystem}>
      <HookNamesContext.Provider value={names}>
        <HookNameField ariaLabel='Hook name' value={value} onChange={onChange} onCommit={onCommit} />
      </HookNamesContext.Provider>
    </ChakraProvider>,
  )

  return { onChange, onCommit }
}

describe('HookNameField', () => {
  it('offers the loaded hooks and commits the one chosen', () => {
    const { onChange, onCommit } = renderField(['positive', 'slug'], '')
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['(choose a hook)', 'positive', 'slug'])

    fireEvent.change(screen.getByLabelText('Hook name'), { target: { value: 'slug' } })

    expect(onChange).toHaveBeenCalledWith('slug')
    expect(onCommit).toHaveBeenCalled()
  })

  it('keeps a name the recipe already has that is not loaded, and marks it', () => {
    renderField(['positive'], 'gone')
    expect(screen.getByRole('option', { name: 'gone (not in the loaded hooks)' })).toBeTruthy()
    expect(screen.getByLabelText('Hook name')).toHaveProperty('value', 'gone')
  })

  it('is a text field with the way to get the list when Studio has no hooks', () => {
    const { onChange, onCommit } = renderField(undefined, 'mine')
    const input = screen.getByLabelText('Hook name')
    expect(input).toHaveProperty('value', 'mine')
    expect(screen.getByText(/opencraw studio --hooks/)).toBeTruthy()

    fireEvent.change(input, { target: { value: 'mine2' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith('mine2')
    expect(onCommit).toHaveBeenCalled()
  })

  it('says so when the hooks file exports nothing', () => {
    renderField([], '')
    expect(screen.getByText('The hooks file exports no hooks.')).toBeTruthy()
  })
})
