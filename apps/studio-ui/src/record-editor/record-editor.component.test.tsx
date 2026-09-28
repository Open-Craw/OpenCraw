import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import type { RecipeListing } from '@opencraw/studio'
import { RecordEditor } from './record-editor.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

const INPUT: RecipeListing = {
  file:   '/recipes/books.input.json',
  kind:   'input',
  id:     'books',
  issues: [],
  text:   `${JSON.stringify({
    kind:    'input',
id:      'books',
output:  'book',
mode:    'web',
    start:   [{ url: 'https://x/' }],
    steps:   [{ type: 'extract', id: 'title' }, { type: 'extract', id: 'price' }],
    mapping: { price: { from: 'price' } },
  }, null, 2)}\n`,
}

const OUTPUT: RecipeListing = {
  file:   '/recipes/book.output.json',
  kind:   'output',
  id:     'book',
  issues: [],
  text:   `${JSON.stringify({
    kind:    'output',
id:      'book',
version: 1,
    fields:  { price: { type: 'string', required: true, key: true } },
  }, null, 2)}\n`,
}

describe('RecordEditor', () => {
  it('says to select a recipe when none is selected', () => {
    renderWithChakra(<RecordEditor records={[]} rejected={[]} onSaveInput={async () => {}} onSaveOutput={async () => {}} />)
    expect(screen.getByText(/select a recipe/i)).toBeTruthy()
  })

  it('says the recipe names no output recipe found in the workspace', () => {
    renderWithChakra(<RecordEditor inputRecipe={INPUT} records={[]} rejected={[]} onSaveInput={async () => {}} onSaveOutput={async () => {}} />)
    expect(screen.getByText(/names no output recipe/i)).toBeTruthy()
  })

  it('renders a row per output field, with its mapped source', () => {
    renderWithChakra(<RecordEditor inputRecipe={INPUT} outputRecipe={OUTPUT} records={[]} rejected={[]} onSaveInput={async () => {}} onSaveOutput={async () => {}} />)
    // Two matches: the field's own name input and its source dropdown's selected option both read "price".
    expect(screen.getAllByDisplayValue('price')).toHaveLength(2)
  })

  it('adds a field and enables Save once the field table is dirty', () => {
    renderWithChakra(<RecordEditor inputRecipe={INPUT} outputRecipe={OUTPUT} records={[]} rejected={[]} onSaveInput={async () => {}} onSaveOutput={async () => {}} />)

    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton.hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByText('+ field'))

    expect(saveButton.hasAttribute('disabled')).toBe(false)
    expect(screen.getByDisplayValue('field')).toBeTruthy()
  })

  it('saves both the output and input recipes', async () => {
    const onSaveOutput = jest.fn().mockResolvedValue(undefined)
    const onSaveInput = jest.fn().mockResolvedValue(undefined)
    renderWithChakra(<RecordEditor inputRecipe={INPUT} outputRecipe={OUTPUT} records={[]} rejected={[]} onSaveInput={onSaveInput} onSaveOutput={onSaveOutput} />)

    fireEvent.click(screen.getByText('+ field'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => { expect(onSaveOutput).toHaveBeenCalled() })
    expect(onSaveOutput.mock.calls[0][0]).toBe(OUTPUT.file)
    expect(onSaveInput.mock.calls[0][0]).toBe(INPUT.file)
    const savedFields = (onSaveOutput.mock.calls[0][1] as { fields: Record<string, unknown> }).fields
    expect(Object.keys(savedFields)).toEqual(['price', 'field'])
    const savedMapping = (onSaveInput.mock.calls[0][1] as { mapping: Record<string, unknown> }).mapping
    expect(savedMapping.price).toBeDefined()
  })

  it('shows the transform chain\'s real value from the selected sample record', () => {
    const inputWithTransform: RecipeListing = {
      ...INPUT,
      text: `${JSON.stringify({
        kind:    'input',
id:      'books',
output:  'book',
mode:    'web',
        start:   [{ url: 'https://x/' }],
        steps:   [{ type: 'extract', id: 'title' }, { type: 'extract', id: 'price' }],
        mapping: { price: { from: 'price', transform: [{ op: 'trim' }] } },
      }, null, 2)}\n`,
    }
    renderWithChakra(
      <RecordEditor
        inputRecipe={inputWithTransform}
        outputRecipe={OUTPUT}
        records={[{ key: 'a', data: { price: '£9.50' }, mapping: { price: { from: ' £9.50 ', steps: [{ op: 'trim', value: '£9.50' }] } } }]}
        rejected={[]}
        onSaveInput={async () => {}}
        onSaveOutput={async () => {}}
      />,
    )
    expect(screen.getByText('trim')).toBeTruthy()
    expect(screen.getByText('→ £9.50')).toBeTruthy()
  })

  it('shows a "Why null?" button when the selected record\'s value is null, and calls onExplainMissing with the record index and field', () => {
    const onExplainMissing = jest.fn()
    renderWithChakra(
      <RecordEditor
        inputRecipe={INPUT}
        outputRecipe={OUTPUT}
        records={[{ key: 'a', data: { price: null } }]}
        rejected={[]}
        onSaveInput={async () => {}}
        onSaveOutput={async () => {}}
        onExplainMissing={onExplainMissing}
      />,
    )
    fireEvent.click(screen.getByText('Why null?'))
    expect(onExplainMissing).toHaveBeenCalledWith(0, 'price')
  })
})
