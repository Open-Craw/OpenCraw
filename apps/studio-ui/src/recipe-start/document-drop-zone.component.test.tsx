import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { DocumentDropZone } from './document-drop-zone.component'

function renderZone (onFile: (file: File) => void) {
  return render(
    <ChakraProvider value={defaultSystem}>
      <DocumentDropZone onFile={onFile}>
        <p>the shell</p>
      </DocumentDropZone>
    </ChakraProvider>,
  )
}

function fileTransfer (...files: File[]): { files: File[], types: string[], dropEffect: string } {
  return { files, types: ['Files'], dropEffect: 'none' }
}

describe('DocumentDropZone (issue #120)', () => {
  it('renders its children and no overlay until a file is dragged over it', () => {
    renderZone(() => {})
    expect(screen.getByText('the shell')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows what dropping does while a file is dragged over, and hides it again once the drag leaves', () => {
    renderZone(() => {})
    const zone = screen.getByTestId('document-drop-zone')

    fireEvent.dragEnter(zone, { dataTransfer: fileTransfer(new File(['x'], 'report.pdf')) })
    expect(screen.getByRole('status').textContent).toMatch(/drop to start a recipe/i)

    fireEvent.dragLeave(zone, { dataTransfer: fileTransfer(new File(['x'], 'report.pdf')) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('hands the dropped file to onFile and clears the overlay', () => {
    const onFile = jest.fn()
    renderZone(onFile)
    const zone = screen.getByTestId('document-drop-zone')
    const file = new File(['%PDF-1.4'], 'report.pdf', { type: 'application/pdf' })

    fireEvent.dragEnter(zone, { dataTransfer: fileTransfer(file) })
    fireEvent.drop(zone, { dataTransfer: fileTransfer(file) })

    expect(onFile).toHaveBeenCalledWith(file)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('ignores a drag that carries no file (text, a link)', () => {
    const onFile = jest.fn()
    renderZone(onFile)
    const zone = screen.getByTestId('document-drop-zone')

    fireEvent.dragEnter(zone, { dataTransfer: { files: [], types: ['text/plain'], dropEffect: 'none' } })
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.drop(zone, { dataTransfer: { files: [], types: ['text/plain'], dropEffect: 'none' } })
    expect(onFile).not.toHaveBeenCalled()
  })
})
