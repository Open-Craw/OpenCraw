import { walkXml } from '../ooxml-package'

/** What the styles of an OpenDocument text say about its paragraphs and lists. */
export interface OdtStyles {
  /** Paragraph styles by name: their parent, and whether the style is an automatic one (a generated `P1`, not a named style a person chose). */
  paragraphs: Map<string, { parent?: string, automatic: boolean }>
  /** List styles by name: for each level from 1, whether it counts (a number) or not (a bullet or a picture). */
  lists:      Map<string, Map<number, boolean>>
}

/** @returns Styles with nothing in them yet. */
export function emptyOdtStyles (): OdtStyles {
  return { paragraphs: new Map(), lists: new Map() }
}

/**
 * Adds the paragraph and list styles a `content.xml` or `styles.xml` declares, named or automatic.
 *
 * @param xml - The part's text.
 * @param into - The styles to add to.
 */
export function readOdtStyles (xml: string, into: OdtStyles): void {
  let automatic = false
  let list: Map<number, boolean> | undefined
  walkXml(xml, {
    open: (name, attributes) => {
      switch (name) {
        case 'automatic-styles': {
          automatic = true
          break
        }
        case 'style': {
          const styleName = attributes['style:name']
          if (styleName !== undefined && attributes['style:family'] === 'paragraph') into.paragraphs.set(styleName, { parent: attributes['style:parent-style-name'], automatic })
          break
        }
        case 'list-style': {
          const listName = attributes['style:name']
          list = new Map()
          if (listName !== undefined) into.lists.set(listName, list)
          break
        }
        case 'list-level-style-number': {
          list?.set(Number(attributes['text:level'] ?? 1), true)
          break
        }
        case 'list-level-style-bullet':
        case 'list-level-style-image': {
          list?.set(Number(attributes['text:level'] ?? 1), false)
          break
        }
        // No default
      }
    },
    close: (name) => {
      if (name === 'automatic-styles') automatic = false
      else if (name === 'list-style') list = undefined
    },
  })
}

/** A style's name as a person knows it: an automatic style (`P1`) stands for the named style it is built on. */
export function namedStyle (styles: OdtStyles, style: string | undefined): string | undefined {
  let current = style
  const seen = new Set<string>()
  while (current !== undefined && !seen.has(current)) {
    seen.add(current)
    const known = styles.paragraphs.get(current)
    if (known === undefined || !known.automatic || known.parent === undefined) return current
    current = known.parent
  }

  return current
}

/** `Title` is a heading of level 1, `Heading_20_2` (the style called Heading 2) one of level 2. */
export function headingOfStyle (styles: OdtStyles, style: string | undefined): number | undefined {
  const name = namedStyle(styles, style)
  if (name === undefined) return undefined
  if (name === 'Title') return 1
  const match = /^Heading(?:_20_| )?(\d)$/.exec(name)

  return match === null ? undefined : Number(match[1])
}

/** Whether a list style counts at a level (from 1): a bullet does not, and neither does a list with no style. */
export function isOrderedList (styles: OdtStyles, style: string | undefined, level: number): boolean {
  return style !== undefined && styles.lists.get(style)?.get(level) === true
}
