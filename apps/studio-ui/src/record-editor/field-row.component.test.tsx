import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { PILL_DRAG_MIME } from '../steps-outline'
import { FieldRow } from './field-row.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

function noop (): void {}

describe('FieldRow', () => {
  it('renames a field when the new name is valid (issue #81: no dots)', () => {
    const onRename = jest.fn()
    renderWithChakra(
      <FieldRow name='price' field={{ type: 'string' }} scopeIds={[]} onFieldChange={noop} onRename={onRename} onRemove={noop} onRuleChange={noop} />,
    )
    const input = screen.getByDisplayValue('price')
    fireEvent.change(input, { target: { value: 'newPrice' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('newPrice')
  })

  it('rejects a field name with a dot and does not rename', () => {
    const onRename = jest.fn()
    renderWithChakra(
      <FieldRow name='price' field={{ type: 'string' }} scopeIds={[]} onFieldChange={noop} onRename={onRename} onRemove={noop} onRuleChange={noop} />,
    )
    const input = screen.getByDisplayValue('price')
    fireEvent.change(input, { target: { value: 'a.b' } })
    fireEvent.blur(input)
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByText('a field name has no dots')).toBeTruthy()
  })

  it('maps a field by dropping a pill onto its source', () => {
    const onRuleChange = jest.fn()
    renderWithChakra(
      <FieldRow name='price' field={{ type: 'string' }} scopeIds={['title']} onFieldChange={noop} onRename={noop} onRemove={noop} onRuleChange={onRuleChange} />,
    )
    const dropTarget = screen.getByTestId('price-source-drop')
    fireEvent.drop(dropTarget, { dataTransfer: { getData: (type: string) => (type === PILL_DRAG_MIME ? 'price' : '') } })
    expect(onRuleChange).toHaveBeenCalledWith({ from: 'price' })
  })

  it('picks a source from the scope dropdown', () => {
    const onRuleChange = jest.fn()
    renderWithChakra(
      <FieldRow name='price' field={{ type: 'string' }} scopeIds={['title', 'price']} onFieldChange={noop} onRename={noop} onRemove={noop} onRuleChange={onRuleChange} />,
    )
    fireEvent.change(screen.getByDisplayValue(/drop a pill/i), { target: { value: 'price' } })
    expect(onRuleChange).toHaveBeenCalledWith({ from: 'price' })
  })

  it('shows a "Why null?" button for a missing value and calls onExplainMissing', () => {
    const onExplainMissing = jest.fn()
    renderWithChakra(
      <FieldRow name='price' field={{ type: 'string' }} scopeIds={[]} missing onFieldChange={noop} onRename={noop} onRemove={noop} onRuleChange={noop} onExplainMissing={onExplainMissing} />,
    )
    fireEvent.click(screen.getByText('Why null?'))
    expect(onExplainMissing).toHaveBeenCalled()
  })

  it('shows a rejected count and calls onExplainRejected', () => {
    const onExplainRejected = jest.fn()
    renderWithChakra(
      <FieldRow name='price' field={{ type: 'string' }} scopeIds={[]} rejected={{ count: 2, reason: 'not a number' }} onFieldChange={noop} onRename={noop} onRemove={noop} onRuleChange={noop} onExplainRejected={onExplainRejected} />,
    )
    fireEvent.click(screen.getByText('2 rejected'))
    expect(onExplainRejected).toHaveBeenCalled()
  })

  it('shows generated fields as read-only, with no source dropdown or transforms', () => {
    renderWithChakra(
      <FieldRow name='id' field={{ type: 'string', generated: 'uuid' }} scopeIds={[]} onFieldChange={noop} onRename={noop} onRemove={noop} onRuleChange={noop} />,
    )
    expect(screen.getByText('generated: uuid')).toBeTruthy()
    expect(screen.queryByText('+ transform')).toBeNull()
  })

  it('reports its own hover as stepId on enter and undefined on leave, when it has one (issue #111)', () => {
    const onHoverStepId = jest.fn()
    renderWithChakra(
      <FieldRow name='price' field={{ type: 'string' }} scopeIds={[]} stepId='rawPrice' onHoverStepId={onHoverStepId} onFieldChange={noop} onRename={noop} onRemove={noop} onRuleChange={noop} />,
    )
    const row = screen.getByTestId('price-row')
    fireEvent.mouseEnter(row)
    expect(onHoverStepId).toHaveBeenCalledWith('rawPrice')
    fireEvent.mouseLeave(row)
    expect(onHoverStepId).toHaveBeenCalledWith(undefined)
  })

  it('renders highlighted when told to, and not otherwise', () => {
    const { rerender } = renderWithChakra(
      <FieldRow name='price' field={{ type: 'string' }} scopeIds={[]} highlighted onFieldChange={noop} onRename={noop} onRemove={noop} onRuleChange={noop} />,
    )
    expect(screen.getByTestId('price-row').dataset.highlighted).toBe('true')
    rerender(
      <ChakraProvider value={defaultSystem}>
        <FieldRow name='price' field={{ type: 'string' }} scopeIds={[]} onFieldChange={noop} onRename={noop} onRemove={noop} onRuleChange={noop} />
      </ChakraProvider>,
    )
    expect(screen.getByTestId('price-row').dataset.highlighted).toBe('false')
  })

  it('does not wire hover at all without a stepId (an object/each summary row, or an unmapped field)', () => {
    const onHoverStepId = jest.fn()
    renderWithChakra(
      <FieldRow name='price' field={{ type: 'string' }} scopeIds={[]} onHoverStepId={onHoverStepId} onFieldChange={noop} onRename={noop} onRemove={noop} onRuleChange={noop} />,
    )
    fireEvent.mouseEnter(screen.getByTestId('price-row'))
    expect(onHoverStepId).not.toHaveBeenCalled()
  })
})
