import { OoxmlPackage } from '../ooxml-package'
import type { PackageLimits } from '../ooxml-package'
import type { Deck, Slide, SlideChart, SlideFilter } from '../presentation'
import { readSource } from '../source-bytes'
import type { OfficeSource } from '../source-bytes'
import type { ValueMode } from '../spreadsheet'
import { odpChart } from './odp-chart.mapper'
import { odpPageSize } from './odp-page-size.mapper'
import { odpSlides } from './odp-slides.mapper'

/** How to read an OpenDocument presentation; the same choices as `readPptx`. */
export interface ReadOdpOptions {
  /** Which slides to read; default all. */
  slides?: SlideFilter
  /** `typed` (default): chart values as numbers; `text`: as text. */
  values?: ValueMode
  /** Read speaker notes; default true. */
  notes?:  boolean
  /** Read charts; default true. */
  charts?: boolean
  /** How much the file may inflate to. */
  limits?: PackageLimits
}

/** The media type an OpenDocument presentation declares in its `mimetype` entry. */
const ODP_MIMETYPE = 'application/vnd.oasis.opendocument.presentation'

function selector (filter: SlideFilter | undefined): (slide: { number: number, title: string, hidden: boolean }) => boolean {
  if (filter === undefined) return () => true
  if (Array.isArray(filter)) return slide => filter.includes(slide.number)
  if (filter instanceof RegExp) return slide => filter.test(slide.title)

  return filter
}

/** The folder a chart object lives in, from the link the slide holds (`./Object 1`): its `content.xml`. */
function chartPart (link: string): string {
  return `${link.replace(/^\.\//, '').replace(/\/$/, '')}/content.xml`
}

/**
 * Reads an OpenDocument presentation (`.odp`, as LibreOffice, Google Slides and PowerPoint save it) into the same {@link Deck} model `readPptx`
 * gives: every slide's text boxes with their positions in points, its title, its tables, its charts' data and its notes. Footers, dates and slide
 * numbers are left out.
 *
 * @param source - A path, bytes, a Blob or a stream (see {@link OfficeSource}).
 * @param options - Which slides, which value mode, what to leave out, which limits.
 * @returns The deck.
 * @throws OfficeReadError for a file that is not a readable presentation: `not-zip`, `legacy-format`, `unsupported-format` (another kind of file), `too-large`…
 */
export async function readOdp (source: OfficeSource, options: ReadOdpOptions & { values: 'text' }): Promise<Deck<string>>
export async function readOdp (source: OfficeSource, options?: ReadOdpOptions): Promise<Deck>
export async function readOdp (source: OfficeSource, options: ReadOdpOptions = {}): Promise<Deck<number | null | string>> {
  const pkg = OoxmlPackage.openOpenDocument(await readSource(source), ODP_MIMETYPE, options.limits)
  const { slides: found, hiddenStyles } = odpSlides(pkg.text('content.xml'))
  const mode = options.values ?? 'typed'
  const selected = selector(options.slides)
  const slides: Slide<number | null | string>[] = []
  for (const [index, slide] of found.entries()) {
    const hidden = slide.style !== undefined && hiddenStyles.has(slide.style)
    const number = index + 1
    if (!selected({ number, title: slide.title ?? '', hidden })) continue
    const charts: SlideChart<number | null | string>[] = options.charts === false
      ? []
      : slide.chartLinks.flatMap((link) => {
          const chart = odpChart(pkg.text(chartPart(link)), mode)

          return chart === undefined ? [] : [chart]
        })
    slides.push({
      number,
      ...(slide.title !== undefined && { title: slide.title }),
      hidden,
      shapes: slide.shapes,
      tables: slide.tables,
      charts,
      notes:  options.notes === false ? '' : slide.notes,
    })
  }
  const size = odpPageSize(pkg.text('styles.xml'), found[0]?.master)

  return { width: size.width, height: size.height, slides }
}
