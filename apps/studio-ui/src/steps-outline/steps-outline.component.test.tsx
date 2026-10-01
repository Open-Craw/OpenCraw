import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import type { OutlineView, RecipeListing } from '@opencraw/studio'
import { resetRecordingStore, resetStudioUiStore, useRecordingStore, useStudioUiStore } from '../studio-store'
import { CARD_DRAG_MIME } from './card-drop.model'
import { StepsOutline } from './steps-outline.component'

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

beforeEach(() => {
  resetRecordingStore()
  resetStudioUiStore()
})

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

  it('appends live recording-card events below the real outline, read-only (no move/remove buttons)', () => {
    const outline: OutlineView = { recipe: {}, steps: [{ kind: 'card', path: 'steps.0', stepType: 'goto', sentence: [{ kind: 'word', text: 'Go to' }], step: { type: 'goto', url: '/login' }, custom: false }] }
    act(() => { useRecordingStore.getState().startRecording('books', 'https://example.test/login') })
    act(() => {
      useRecordingStore.getState().addCard({
        node:   { kind: 'card', path: 'steps.0', stepType: 'fill', sentence: [{ kind: 'word', text: 'Fill' }, { kind: 'pill', text: 'user' }, { kind: 'word', text: 'with' }, { kind: 'code', text: 'alice' }], custom: false, step: { type: 'fill', selector: '#user', value: 'alice' } },
        secret: false,
      })
    })
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={async () => {}} />)

    const recordingSection = screen.getByTestId('recording-cards')
    expect(within(recordingSection).getByText('Fill')).toBeTruthy()
    expect(within(recordingSection).queryByLabelText('Move up')).toBeNull()
    expect(within(recordingSection).queryByLabelText('Remove step')).toBeNull()
  })

  it('shows nothing extra when no recording is active for this recipe', () => {
    const outline: OutlineView = { recipe: {}, steps: [] }
    act(() => { useRecordingStore.getState().startRecording('a-different-recipe', 'https://example.test/') })
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={async () => {}} />)
    expect(screen.queryByTestId('recording-cards')).toBeNull()
  })

  it('a secret fill card\'s value renders as a secret pill, never the pill for an ordinary field name', () => {
    const outline: OutlineView = { recipe: {}, steps: [] }
    act(() => { useRecordingStore.getState().startRecording('books', 'https://example.test/login') })
    act(() => {
      useRecordingStore.getState().addCard({
        node:   { kind: 'card', path: 'steps.0', stepType: 'fill', sentence: [{ kind: 'word', text: 'Fill' }, { kind: 'pill', text: 'pass' }, { kind: 'word', text: 'with' }, { kind: 'code', text: '{{env.PASS}}' }], custom: false, step: { type: 'fill', selector: '#pass', value: '{{env.PASS}}' } },
        secret: true,
      })
    })
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={async () => {}} />)
    const value = screen.getByText('{{env.PASS}}')
    expect(value.title).toContain('PASS')
  })

  it('"Turn into pagination" appends a paginate bracket with the note\'s own selector and saves it', () => {
    const outline: OutlineView = { recipe: { kind: 'input', id: 'books' }, steps: [] }
    const onSaveOutline = jest.fn().mockResolvedValue(undefined)
    act(() => { useRecordingStore.getState().startRecording('books', 'https://example.test/search') })
    act(() => {
      useRecordingStore.getState().addCard({ node: { kind: 'card', path: 'steps.0', stepType: 'click', sentence: [{ kind: 'word', text: 'Click' }], custom: false, step: { type: 'click', selector: '#next' } }, secret: false })
      useRecordingStore.getState().addNote({ kind: 'next-link', message: 'turn this into pagination?', selector: '#next' })
    })
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={onSaveOutline} />)

    fireEvent.click(screen.getByRole('button', { name: /turn into pagination/i }))

    expect(onSaveOutline).toHaveBeenCalledTimes(1)
    const [path, savedOutline] = onSaveOutline.mock.calls[0] as [string, OutlineView]
    expect(path).toBe('/r/books.input.json')
    expect(stepsOf(savedOutline)).toEqual([{ type: 'paginate', next: { selector: '#next' }, steps: [] }])
    expect(screen.getByText('Added')).toBeTruthy()
  })

  it('a next-link note with no resolved selector shows the message with no action', () => {
    const outline: OutlineView = { recipe: {}, steps: [] }
    act(() => { useRecordingStore.getState().startRecording('books', 'https://example.test/search') })
    act(() => { useRecordingStore.getState().addNote({ kind: 'next-link', message: 'turn this into pagination?' }) })
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={async () => {}} />)
    expect(screen.getByText('turn this into pagination?')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /turn into pagination/i })).toBeNull()
  })

  it('hovering a card writes the step\'s own id as the cross-panel highlight, and clears it on leave (issue #111)', () => {
    const outline: OutlineView = {
      recipe: {},
      steps:  [{ kind: 'card', path: 'steps.0', stepType: 'extract', sentence: [{ kind: 'word', text: 'Read' }], custom: false, step: { type: 'extract', id: 'title', selector: 'h1', kind: 'css' } }],
    }
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={async () => {}} />)
    const card = screen.getByTestId('outline-card-steps.0').firstChild as HTMLElement

    fireEvent.mouseEnter(card)
    expect(useStudioUiStore.getState().hoveredStepId).toBe('title')
    expect(card.dataset.highlighted).toBe('true')

    fireEvent.mouseLeave(card)
    expect(useStudioUiStore.getState().hoveredStepId).toBeUndefined()
    expect(card.dataset.highlighted).toBe('false')
  })

  it('appends a card dropped on the tab (a canvas\'s staged selection, issue #121) and saves it, re-pathed to its new slot', () => {
    const outline: OutlineView = { recipe: { kind: 'input', id: 'books' }, steps: [{ kind: 'card', path: 'steps.0', stepType: 'request', sentence: [], step: { type: 'request', id: 'doc', url: '{{start.url}}' }, custom: false }] }
    const onSaveOutline = jest.fn().mockResolvedValue(undefined)
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={onSaveOutline} />)
    const card = { kind: 'card', path: 'staged', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'title', kind: 'region', selector: 'page=1 x=71..273 y=799..813' } }
    const dataTransfer = { types: [CARD_DRAG_MIME], getData: (type: string) => (type === CARD_DRAG_MIME ? JSON.stringify(card) : ''), dropEffect: 'none' }
    const tab = screen.getByTestId('steps-outline')

    fireEvent.dragOver(tab, { dataTransfer })
    expect(tab.dataset.cardOver).toBe('true')
    fireEvent.drop(tab, { dataTransfer })

    expect(tab.dataset.cardOver).toBe('false')
    expect(onSaveOutline).toHaveBeenCalledTimes(1)
    const [, saved] = onSaveOutline.mock.calls[0] as [string, OutlineView]
    expect(stepsOf(saved)).toEqual([{ type: 'request', id: 'doc', url: '{{start.url}}' }, { type: 'extract', id: 'title', kind: 'region', selector: 'page=1 x=71..273 y=799..813' }])
    expect(saved.steps[1].path).toBe('steps.1')
  })

  it('ignores a drop that carries no card (a pill, a file)', () => {
    const outline: OutlineView = { recipe: {}, steps: [] }
    const onSaveOutline = jest.fn().mockResolvedValue(undefined)
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={onSaveOutline} />)

    fireEvent.drop(screen.getByTestId('steps-outline'), { dataTransfer: { types: ['application/x-opencraw-pill'], getData: () => 'title', dropEffect: 'none' } })

    expect(onSaveOutline).not.toHaveBeenCalled()
  })

  it('highlights a card when another panel sets its step id as the hovered one', () => {
    const outline: OutlineView = {
      recipe: {},
      steps:  [{ kind: 'card', path: 'steps.0', stepType: 'extract', sentence: [{ kind: 'word', text: 'Read' }], custom: false, step: { type: 'extract', id: 'title', selector: 'h1', kind: 'css' } }],
    }
    renderWithChakra(<StepsOutline recipe={recipeWith(outline)} onSaveOutline={async () => {}} />)
    const card = screen.getByTestId('outline-card-steps.0').firstChild as HTMLElement
    expect(card.dataset.highlighted).toBe('false')

    act(() => { useStudioUiStore.getState().setHoveredStepId('title') })
    expect(card.dataset.highlighted).toBe('true')
  })
})
