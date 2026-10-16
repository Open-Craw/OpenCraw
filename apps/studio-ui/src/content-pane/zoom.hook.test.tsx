import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { ZoomControls } from './zoom-controls.component'
import { useZoom } from './zoom.hook'

function Harness () {
  const ref = useRef<HTMLDivElement>(null)
  const zoom = useZoom(ref)

  return <div ref={ref} data-testid='area'><ZoomControls {...zoom} /></div>
}

describe('zoom', () => {
  it('steps in and out, and the percentage resets it', () => {
    render(<ChakraProvider value={defaultSystem}><Harness /></ChakraProvider>)
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('100%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('125%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('80%')
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('100%')
  })

  it('zooms with ctrl + wheel, and leaves a plain wheel to scroll', () => {
    render(<ChakraProvider value={defaultSystem}><Harness /></ChakraProvider>)
    const area = screen.getByTestId('area')

    act(() => { fireEvent.wheel(area, { deltaY: 100 }) })
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('100%')
    act(() => { fireEvent.wheel(area, { deltaY: -100, ctrlKey: true }) })
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('125%')
  })

  it('stops at the largest and smallest zoom', () => {
    render(<ChakraProvider value={defaultSystem}><Harness /></ChakraProvider>)
    for (let index = 0; index < 12; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('300%')
    for (let index = 0; index < 12; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('50%')
  })
})
