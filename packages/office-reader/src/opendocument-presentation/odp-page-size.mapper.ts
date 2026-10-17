import { walkXml } from '../ooxml-package'
import { pointsOf } from './odp-length.algorithm'

/** A slide's size in points. */
export interface PageSize {
  width:  number
  height: number
}

/** 28 × 15.75 cm, what LibreOffice makes a 16:9 presentation, for a file that says nothing. */
const DEFAULT_SIZE: PageSize = { width: 793.7, height: 446.46 }

/**
 * The slide size an OpenDocument presentation declares: the page layout of the master page the first slide uses, else of the first master page.
 *
 * @param xml - `styles.xml` (page layouts and master pages), plus `content.xml` when it holds automatic page layouts, as text.
 * @param masterName - The master page the first slide names, when it names one.
 * @returns The size in points.
 */
export function odpPageSize (xml: string, masterName: string | undefined): PageSize {
  const layouts = new Map<string, Partial<PageSize>>()
  const masters = new Map<string, string>()
  let first: string | undefined
  let layout: Partial<PageSize> | undefined
  walkXml(xml, {
    open: (name, attributes) => {
      if (name === 'page-layout') {
        layout = {}
        const layoutName = attributes['style:name']
        if (layoutName !== undefined) layouts.set(layoutName, layout)
      } else if (name === 'page-layout-properties' && layout !== undefined) {
        layout.width = pointsOf(attributes['fo:page-width'])
        layout.height = pointsOf(attributes['fo:page-height'])
      } else if (name === 'master-page') {
        const masterPage = attributes['style:name']
        const layoutName = attributes['style:page-layout-name']
        if (masterPage !== undefined && layoutName !== undefined) {
          masters.set(masterPage, layoutName)
          first ??= masterPage
        }
      }
    },
    close: (name) => {
      if (name === 'page-layout') layout = undefined
    },
  })
  const layoutName = masters.get(masterName ?? '') ?? masters.get(first ?? '')
  const size = layoutName === undefined ? undefined : layouts.get(layoutName)

  return { width: size?.width ?? DEFAULT_SIZE.width, height: size?.height ?? DEFAULT_SIZE.height }
}
