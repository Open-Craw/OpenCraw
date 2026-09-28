import { render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import type { SentencePart } from '@opencraw/studio'
import { SentenceView } from './sentence-view.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

describe('SentenceView', () => {
  it('renders a plain code literal as code, not a secret pill', () => {
    const parts: SentencePart[] = [{ kind: 'word', text: 'Fill' }, { kind: 'pill', text: 'q' }, { kind: 'word', text: 'with' }, { kind: 'code', text: 'widgets' }]
    renderWithChakra(<SentenceView parts={parts} />)

    const value = screen.getByText('widgets')
    expect(value.tagName).toBe('CODE')
    expect(value.title).toBe('')
  })

  it('renders a {{env.NAME}} code literal as a distinct secret pill with a tooltip naming the env var, never the real value', () => {
    const parts: SentencePart[] = [{ kind: 'word', text: 'Fill' }, { kind: 'pill', text: 'pass' }, { kind: 'word', text: 'with' }, { kind: 'code', text: '{{env.PASS}}' }]
    renderWithChakra(<SentenceView parts={parts} />)

    const value = screen.getByText('{{env.PASS}}')
    expect(value.tagName).not.toBe('CODE') // the secret pill, not the plain code-literal rendering
    expect(value.title).toContain('PASS')
    expect(value.title).not.toContain('{{env.PASS}}')
  })

  it('renders an ordinary pill as a Pill, unaffected by the secret-placeholder check', () => {
    const parts: SentencePart[] = [{ kind: 'pill', text: 'book' }]
    renderWithChakra(<SentenceView parts={parts} />)
    expect(screen.getByText('book')).toBeTruthy()
  })
})
