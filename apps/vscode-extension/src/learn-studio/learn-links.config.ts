/** One place to read about OpenCraw, shown in the Learn view. */
export interface LearnLink {
  label:       string
  description: string
  url:         string
  /** A built-in editor icon name (a codicon). */
  icon:        string
}

const DOCS = 'https://github.com/Open-Craw/OpenCraw/blob/main/docs'

/** What a newcomer should read, in the order they will want it: Studio first, then recipes, then how it all works, then where to ask. */
export const LEARN_LINKS: readonly LearnLink[] = [
  { label: 'Studio manual', description: 'Every button, what it does and when to use it', url: `${DOCS}/studio/manual.md`, icon: 'book' },
  { label: 'Tutorial: one recipe, two PDFs', description: 'Read two different PDFs into one output, step by step', url: `${DOCS}/studio/pdf-agreements.md`, icon: 'mortar-board' },
  { label: 'Quick guide to recipes', description: 'What an input and an output recipe are, in ten minutes', url: `${DOCS}/recipes/quick-guide.md`, icon: 'zap' },
  { label: 'Example: vehicles', description: 'Cars from a configurator and a brochure, into one shape', url: `${DOCS}/recipes/vehicles-example.md`, icon: 'symbol-event' },
  { label: 'Example: movies', description: 'A movie database API into an output recipe', url: `${DOCS}/recipes/movies-example.md`, icon: 'symbol-event' },
  { label: 'Authoring guide', description: 'Every step, selector and transform a recipe can use', url: `${DOCS}/recipes/authoring.md`, icon: 'file-code' },
  { label: 'How it works', description: 'Recipes, pages, documents, mapping and running, explained', url: `${DOCS}/how-it-works/README.md`, icon: 'lightbulb' },
  { label: 'Ask or report a problem', description: 'Questions, ideas and bugs on GitHub', url: 'https://github.com/Open-Craw/OpenCraw/issues', icon: 'comment-discussion' },
]
