import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { StepForm } from './step-form'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

function valueOf (element: HTMLElement): string {
  return (element as HTMLInputElement).value
}

describe('StepForm', () => {
  it('renders the catalog\'s fields for the step type, seeded from the step', () => {
    renderWithChakra(<StepForm stepType='goto' step={{ type: 'goto', url: '/books' }} onChange={() => {}} onCommit={() => {}} />)
    expect(valueOf(screen.getByLabelText('url'))).toBe('/books')
  })

  it('commits a text field on blur, with the step\'s other fields untouched', () => {
    const onChange = jest.fn()
    const onCommit = jest.fn()
    renderWithChakra(<StepForm stepType='goto' step={{ type: 'goto', url: '/books' }} onChange={onChange} onCommit={onCommit} />)

    const url = screen.getByLabelText('url')
    fireEvent.change(url, { target: { value: '/authors' } })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.blur(url)

    expect(onChange).toHaveBeenLastCalledWith({ type: 'goto', url: '/authors' })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('commits a boolean field right away, not only on blur', async () => {
    const onChange = jest.fn()
    const onCommit = jest.fn()
    renderWithChakra(<StepForm stepType='click' step={{ type: 'click', selector: '#go' }} onChange={onChange} onCommit={onCommit} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'optional' }))

    await waitFor(() => { expect(onCommit).toHaveBeenCalledTimes(1) })
    expect(onChange).toHaveBeenLastCalledWith({ type: 'click', selector: '#go', optional: true })
  })

  it('commits an enum field on change', () => {
    const onChange = jest.fn()
    const onCommit = jest.fn()
    renderWithChakra(<StepForm stepType='goto' step={{ type: 'goto', url: '/' }} onChange={onChange} onCommit={onCommit} />)

    fireEvent.change(screen.getByLabelText('wait until'), { target: { value: 'networkidle' } })

    expect(onChange).toHaveBeenLastCalledWith({ type: 'goto', url: '/', waitUntil: 'networkidle' })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('flags a number field seeded with a non-number (a hand-edited recipe file) as invalid', () => {
    renderWithChakra(<StepForm stepType='wait' step={{ type: 'wait', selector: '.ready', ms: 'soon' }} onChange={() => {}} onCommit={() => {}} />)

    // A native <input type="number"> cannot render a non-numeric string as its `.value` (the browser/jsdom
    // blanks it), so this asserts the validator's message rather than the (unrenderable) raw field value.
    expect(screen.getByText('must be a number')).toBeTruthy()
  })

  it('accepts a numeric value for a number field without any validation error', () => {
    renderWithChakra(<StepForm stepType='wait' step={{ type: 'wait', selector: '.ready', ms: 500 }} onChange={() => {}} onCommit={() => {}} />)

    expect(valueOf(screen.getByLabelText('ms'))).toBe('500')
    expect(screen.queryByText('must be a number')).toBeNull()
  })

  it('shows "no common fields" and only the Advanced box for a step type the catalog does not cover', () => {
    renderWithChakra(<StepForm stepType='hook' step={{ type: 'hook', name: 'solveThing' }} onChange={() => {}} onCommit={() => {}} />)
    expect(screen.getByText(/no common fields/i)).toBeTruthy()
    expect(screen.getByText(/Advanced \(JSON\)/)).toBeTruthy()
  })

  it('the Advanced (JSON) box edits the whole step and stays independent of the catalog fields', () => {
    const onChange = jest.fn()
    const onCommit = jest.fn()
    renderWithChakra(<StepForm stepType='goto' step={{ type: 'goto', url: '/' }} onChange={onChange} onCommit={onCommit} />)

    fireEvent.click(screen.getByText(/Advanced \(JSON\)/))
    const textarea = screen.getByLabelText('Advanced step JSON')
    fireEvent.change(textarea, { target: { value: '{"type":"goto","url":"/x","waitUntil":"load"}' } })
    fireEvent.blur(textarea)

    expect(onChange).toHaveBeenLastCalledWith({ type: 'goto', url: '/x', waitUntil: 'load' })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
