import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { DropdownMenu } from './dropdown-menu.component'

function renderMenu (onSelect = jest.fn(), onOther = jest.fn()) {
  render(
    <ChakraProvider value={defaultSystem}>
      <DropdownMenu label='Load ▾' items={[{ label: 'Document…', onSelect }, { label: 'Web page…', onSelect: onOther, disabled: true, divider: true }]} />
    </ChakraProvider>,
  )

  return { onSelect, onOther }
}

describe('DropdownMenu', () => {
  it('lists its items only once opened, and runs the one chosen and closes', () => {
    const { onSelect } = renderMenu()
    expect(screen.queryByRole('menuitem')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load ▾' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Document…' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('does nothing for a disabled item and stays open', () => {
    const { onOther } = renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Load ▾' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Web page…' }))
    expect(onOther).not.toHaveBeenCalled()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })

  it('closes on Escape and on a click elsewhere', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Load ▾' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menuitem')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load ▾' }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
})
