import type { OutlineCard, PageDataFindingView } from '@opencraw/studio'

/** A safe default field id: naming fields is the Record tab's job (phase 3, #92), same as a content-pane pick. */
const DEFAULT_FIELD_ID = 'data'

/**
 * Builds the Read card(s) for one "data in the page" pick (studio plan §3.3,
 * issue #93): `meta`/`link` are a single plain attribute Read — they hold
 * one value, not a JSON blob. `ld-json`/`json-script`/`inline-state` all
 * point at a real element on the page (`page-inspector`'s `page-data.algorithm.ts`
 * always computes a structural css selector, inline state assignments
 * included — it locates the exact `<script>` the assignment lives in rather
 * than scanning the page's text with a regex), so all three read its text
 * (`take`'s default — a `css` extract's `take: "json"` reads the element's
 * *outer* html, not its parsed content; `text` is the convention every
 * JSON-LD read in this repo's own recipes already uses, `docs/recipes/authoring.md`
 * and `examples/movies/`); picking one of the value's own top-level keys
 * (`key`, from the findings' `keys` list) adds a second card, `kind:
 * "jsonpath"`, `from` the first one, reading `$.<key>` — the issue's "a
 * jsonpath card".
 *
 * @param finding - The picked finding.
 * @param path - The first card's outline path; a second card (a key pick) is its sibling.
 * @param key - One of `finding.keys`, when a specific field was picked rather than the whole value.
 * @param id - The first card's own id; defaults to `"data"`, same reach as a content-pane pick.
 * @returns One card (a plain value, or the whole parsed JSON blob), or two (the blob, then the key drilled into).
 */
export function pageDataPickNodes (finding: PageDataFindingView, path: string, key: string | undefined, id: string = DEFAULT_FIELD_ID): OutlineCard[] {
  if (finding.kind === 'meta' || finding.kind === 'link') {
    return [{
      kind:     'card',
      path,
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id, selector: finding.selector, kind: 'css', take: `attr:${finding.attribute ?? 'content'}` },
    }]
  }
  const raw: OutlineCard = {
    kind:     'card',
    path,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     { type: 'extract', id, selector: finding.selector, kind: 'css' },
  }
  if (key === undefined) return [raw]
  const drill: OutlineCard = {
    kind:     'card',
    path:     siblingPath(path),
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     { type: 'extract', id: `${id}_${key}`, from: id, selector: `$.${key}`, kind: 'jsonpath' },
  }

  return [raw, drill]
}

function siblingPath (path: string): string {
  const segments = path.split('.')
  // eslint-disable-next-line unicorn/prefer-at -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2022 Array#at)
  const last = Number(segments[segments.length - 1])

  return [...segments.slice(0, -1), String(last + 1)].join('.')
}
