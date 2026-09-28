import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import type { RecipeListing } from '@opencraw/studio'
import { JsonEditor } from './json-editor.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

const CLEAN: RecipeListing = { file: '/r/book.output.json', kind: 'output', id: 'book', issues: [], text: '{\n  "kind": "output"\n}\n' }
const WITH_ISSUES: RecipeListing = {
  file:   '/r/books.input.json',
  kind:   'input',
  id:     'books',
  issues: [{ path: 'mapping.title', message: 'output "book" has no field "title"', kind: 'binding' }],
  text:   '{\n  "kind": "input"\n}\n',
}

describe('JsonEditor', () => {
  it('prompts to select a recipe when none is given', () => {
    renderWithChakra(<JsonEditor onSave={async () => {}} />)
    expect(screen.getByText(/select a recipe/i)).toBeTruthy()
  })

  it('shows "valid" for a recipe with no issues', () => {
    renderWithChakra(<JsonEditor recipe={CLEAN} onSave={async () => {}} />)
    expect(screen.getByText('valid')).toBeTruthy()
  })

  it('shows the issue count and each issue\'s path', () => {
    renderWithChakra(<JsonEditor recipe={WITH_ISSUES} onSave={async () => {}} />)
    expect(screen.getByText('1 issue')).toBeTruthy()
    expect(screen.getByText('mapping.title')).toBeTruthy()
  })

  it('flags invalid JSON as the text is edited, disabling Save', () => {
    renderWithChakra(<JsonEditor recipe={CLEAN} onSave={async () => {}} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{ not json' } })
    expect(screen.getByText(/invalid json/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
  })

  it('calls onSave with the file path and the parsed object', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined)
    renderWithChakra(<JsonEditor recipe={CLEAN} onSave={onSave} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{"kind":"output","id":"book"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(onSave).toHaveBeenCalledWith('/r/book.output.json', { kind: 'output', id: 'book' })
  })
})
