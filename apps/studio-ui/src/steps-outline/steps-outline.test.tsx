import { fireEvent, render, screen, within } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import type { OutlineView, RecipeListing } from '@opencraw/studio'
import { StepsOutline } from './steps-outline'

/**
 * A tiny, local stand-in for `@opencraw/studio`'s real `outlineToRecipe`:
 * this app never imports that package's runtime (only its types — see
 * `steps-outline.tsx`'s own doc comment for why), and pulling it in just
 * for this one assertion drags in the whole server bundle (`import.meta.url`
 * and all), which plain Babel/Jest cannot even parse. Good enough to check
 * what `save-outline` would be asked to write.
 */
function stepsOf (outline: OutlineView): unknown[] {
  return outline.steps.map(node => (node.kind === 'card' ? node.step : { ...node.step, steps: stepsOf({ recipe: {}, steps: node.children }) }))
}

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

function recipeWith (outline?: OutlineView, issues: RecipeListing['issues'] = []): RecipeListing {
  return { file: '/r/books.input.json', kind: 'input', id: 'books', issues, text: '{}\n', outline }
}

describe('StepsOutline', () => {
  it('prompts to select a recipe when none is given', () => {
    renderWithChakra(<StepsOutline onSaveOutline={async () => {}} />)
    expect(screen.getByText(/select a recipe/i)).toBeTruthy()
  })

  it('renders a recipe\'s outline: a card\'s sentence and a bracket\'s nested children', () => {
    const outline: OutlineView = {
      recipe: {},
      steps:  [
        { kind: 'card', path: 'steps.0', stepType: 'goto', sentence: [{ kind: 'word', text: 'Go to' }, { kind: 'code', text: '/' }], step: { type: 'goto', url: '/' }, custom: false },
        {
          kind:     'bracket',
          path:     'steps.1',
          stepType: 'forEach',
          sentence: [{ kind: 'word', text: 'For each' }, { kind: 'pill', text: 'book' }, { kind: 'word', text: 'in' }, { kind: 'pill', text: 'books' }],
          step:     { type: 'forEach', as: 'book', over: 'books', steps: [] },
          children: [{ kind: 'card', path: 'steps.1.steps.0', stepType: 'emit', sentence: [{ kind: 'word', text: 'Emit' }], step: { type: 'emit' }, custom: false }],
        },
      ],
    }
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={async () => {}} />)
    const gotoCard = screen.getByTestId('outline-card-steps.0')
    expect(within(gotoCard).getByText('Go to')).toBeTruthy()
    expect(within(gotoCard).getByText('/')).toBeTruthy()
    const loopCard = screen.getByTestId('outline-card-steps.1')
    expect(within(loopCard).getByText('book')).toBeTruthy()
    const emitCard = screen.getByTestId('outline-card-steps.1.steps.0')
    expect(within(emitCard).getByText('Emit')).toBeTruthy()
  })

  it('adds a step via a "+" menu and saves the recipe JSON it produces', async () => {
    const outline: OutlineView = { recipe: { kind: 'input', id: 'books' }, steps: [] }
    const onSaveOutline = jest.fn().mockResolvedValue(undefined)
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={onSaveOutline} />)

    const menu = screen.getByRole('combobox', { name: /add step/i })
    fireEvent.change(menu, { target: { value: 'goto' } })

    expect(onSaveOutline).toHaveBeenCalledTimes(1)
    const [path, savedOutline] = onSaveOutline.mock.calls[0] as [string, OutlineView]
    expect(path).toBe('/r/books.input.json')
    expect(savedOutline.recipe).toMatchObject({ kind: 'input', id: 'books' })
    expect(stepsOf(savedOutline)).toEqual([{ type: 'goto', url: '' }])
  })

  it('shows a validation issue on the exact card its path names, not a sibling', () => {
    const outline: OutlineView = {
      recipe: {},
      steps:  [
        { kind: 'card', path: 'steps.0', stepType: 'goto', sentence: [{ kind: 'word', text: 'Go to' }], step: { type: 'goto', url: '/' }, custom: false },
        { kind: 'card', path: 'steps.1', stepType: 'emit', sentence: [{ kind: 'word', text: 'Emit' }], step: { type: 'emit' }, custom: false },
      ],
    }
    const issues = [{ path: 'steps.1', message: 'only one emit per path', kind: 'binding' as const }]
    renderWithChakra(<StepsOutline recipe={recipeWith(outline, issues)} onSaveOutline={async () => {}} />)

    const gotoCard = screen.getByTestId('outline-card-steps.0')
    const emitCard = screen.getByTestId('outline-card-steps.1')
    expect(within(emitCard).getByText('only one emit per path')).toBeTruthy()
    expect(within(gotoCard).queryByText('only one emit per path')).toBeNull()
  })

  it('renders a custom/unknown step as its own card, without crashing', () => {
    const outline: OutlineView = {
      recipe: {},
      steps:  [{ kind: 'card', path: 'steps.0', stepType: 'hook', sentence: [{ kind: 'word', text: 'custom step' }], step: { type: 'hook', name: 'solveThing' }, custom: true }],
    }
    expect(() => { renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={async () => {}} />) }).not.toThrow()
    expect(screen.getByText('custom step')).toBeTruthy()
  })
})
