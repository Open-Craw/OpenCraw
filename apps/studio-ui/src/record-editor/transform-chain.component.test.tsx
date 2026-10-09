import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { HookNamesContext } from '../hook-names'
import { TransformChain } from './transform-chain.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

describe('TransformChain', () => {
  it('shows the real value after each transform from the trace (issue #92)', () => {
    renderWithChakra(
      <TransformChain
        transforms={[{ op: 'trim' }, { op: 'currency' }]}
        trace={{ from: ' $9.50 ', steps: [{ op: 'trim', value: '$9.50' }, { op: 'currency', value: { amount: 9.5 } }] }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('trim')).toBeTruthy()
    expect(screen.getByText('currency')).toBeTruthy()
    expect(screen.getByText('→ $9.50')).toBeTruthy()
    expect(screen.getByText('→ {"amount":9.5}')).toBeTruthy()
  })

  it('adds a transform of the chosen op', () => {
    const onChange = jest.fn()
    renderWithChakra(<TransformChain transforms={[]} onChange={onChange} />)

    fireEvent.click(screen.getByText('+ transform'))
    fireEvent.change(screen.getByDisplayValue('op…'), { target: { value: 'trim' } })

    expect(onChange).toHaveBeenCalledWith([{ op: 'trim' }])
  })

  it('removes a transform', () => {
    const onChange = jest.fn()
    renderWithChakra(<TransformChain transforms={[{ op: 'trim' }, { op: 'lowercase' }]} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Remove trim'))

    expect(onChange).toHaveBeenCalledWith([{ op: 'lowercase' }])
  })

  it('reorders a transform to the right', () => {
    const onChange = jest.fn()
    renderWithChakra(<TransformChain transforms={[{ op: 'trim' }, { op: 'lowercase' }]} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Move right'))

    expect(onChange).toHaveBeenCalledWith([{ op: 'lowercase' }, { op: 'trim' }])
  })

  it('renders a hook block by name, with a name picker and no options form', () => {
    renderWithChakra(<TransformChain transforms={[{ op: 'hook', name: 'myHook' }]} onChange={() => {}} />)
    expect(screen.getByText('hook: myHook')).toBeTruthy()
    fireEvent.click(screen.getByText('hook: myHook'))
    expect(screen.queryByText('pattern')).toBeNull()
    expect(screen.getByLabelText('Hook name')).toHaveProperty('value', 'myHook')
  })

  it('adds a hook transform named after the first loaded hook, so the recipe stays valid (issue #202)', () => {
    const onChange = jest.fn()
    renderWithChakra(
      <HookNamesContext.Provider value={['positive', 'slug']}>
        <TransformChain transforms={[]} onChange={onChange} />
      </HookNamesContext.Provider>,
    )
    fireEvent.click(screen.getByText('+ transform'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hook' } })
    expect(onChange).toHaveBeenCalledWith([{ op: 'hook', name: 'positive' }])
  })

  it('picks the name of a hook transform from the loaded hooks', () => {
    const onChange = jest.fn()
    renderWithChakra(
      <HookNamesContext.Provider value={['positive', 'slug']}>
        <TransformChain transforms={[{ op: 'hook', name: 'positive' }]} onChange={onChange} />
      </HookNamesContext.Provider>,
    )

    fireEvent.click(screen.getByText('hook: positive'))
    fireEvent.change(screen.getByLabelText('Hook name'), { target: { value: 'slug' } })

    expect(onChange).toHaveBeenCalledWith([{ op: 'hook', name: 'slug' }])
  })

  it('edits an op\'s option inline', () => {
    const onChange = jest.fn()
    renderWithChakra(<TransformChain transforms={[{ op: 'regex' }]} onChange={onChange} />)

    fireEvent.click(screen.getByText('regex'))
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: String.raw`\d+` } })

    expect(onChange).toHaveBeenCalledWith([{ op: 'regex', pattern: String.raw`\d+` }])
  })
})
