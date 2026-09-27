<p align="center">
  <img src="../assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# OpenCraw Studio: plan

- **Status:** Draft for review (issue [#71](https://github.com/russoedu/open.craw/issues/71))
- **Date:** 2026-09-28
- **Decided so far:** a React app with Chakra UI; the screen split in two, the content on the left and the
  editor on the right; the recipe JSON stays the source of truth; delivered in phases, each one usable on
  its own.

The studio is a visual editor for recipes: open a site, an API or a document, click the data you want, and
get a recipe that runs. This document is the plan: what runs where, how the packages are laid out, how the
editor works, and the phases with what each one delivers.

## Contents

1. [Principles](#1-principles)
2. [Where it runs](#2-where-it-runs)
3. [The content pane: what the engine sees](#3-the-content-pane-what-the-engine-sees)
4. [The editor pane](#4-the-editor-pane)
5. [Package layout](#5-package-layout)
6. [Phases and deliverables](#6-phases-and-deliverables)
7. [Testing](#7-testing)
8. [Security](#8-security)
9. [Changes the engine needs](#9-changes-the-engine-needs)
10. [Decisions still open](#10-decisions-still-open)

## 1. Principles

1. **The JSON is the truth.** The studio reads and writes the recipe files. A hand edit and a studio edit
   round-trip. Anything the studio cannot express shows as a "custom" card and stays editable as JSON.
2. **The content pane shows what the engine sees**, not a prettier version. For a web page it is the DOM
   after the selected step ran; for an api recipe it is the fetched HTML; for a PDF it is the page with the
   engine's cells drawn on it. A pick on that view is a pick the engine will reproduce.
3. **One pick produces one real step.** No hidden state: close the studio and the files hold everything.
4. **The preview is a real run.** The same engine, the same process, with a budget: one page, a few records.
5. **Every phase ships something usable.** Phase 0 is already a visual runner.

## 2. Where it runs

**A local server plus the browser**, started from the terminal:

```sh
npx @opencraw/studio recipes/          # opens http://127.0.0.1:<port>/?token=…
opencraw studio recipes/               # the cli delegates to it when it is installed
```

- The **server** is Node: it loads the recipe set, takes snapshots and runs samples with `@opencraw/core`,
  and serves the built UI. It listens on `127.0.0.1` only, behind a random token.
- The **UI** is a React app (Vite, Chakra UI) talking to the server over HTTP for commands and a WebSocket
  for the run's event stream.
- **Later, Electron** wraps the same UI and server in one window, and swaps the content pane's snapshot for
  a live embedded browser (logins in place, cookies to `storageState`). Nothing in the UI changes; that is
  why the studio is a web app first. Flutter was considered and set aside: the engine is Node and drives
  Chromium, and Electron is exactly that pair.

Alternatives set aside, and why: a browser extension cannot run the engine; a page served by the Azure host
needs a streamed browser (CDP screencast), which is laggy and puts a logged-in browser on a server: an
option for "pick on the production IP" later, not for version 1; an iframe proxy of the live site breaks on
JavaScript-heavy pages (it is how Portia worked).

## 3. The content pane: what the engine sees

### 3.1 Web pages: the snapshot

The content pane does not load the live site. It loads a **snapshot the engine took**:

1. The server runs the recipe up to the selected step (web mode: Playwright; api mode: the HTTP client).
2. It serialises the document: `page.content()` in web mode, the fetched HTML in api mode.
3. It rewrites it for display: every URL made absolute, a `<base>`, every `<script>` removed, forms
   disabled, and each element marked with the engine's own data: a stable node id, and whether it was
   hidden on the live page (`display: none`, `visibility: hidden`, zero size), recorded at capture time.
4. The UI shows it in a **sandboxed iframe** served from the studio's own origin, with scripts off. The
   studio injects its own picker script, the only script that runs.

Why a snapshot and not the live page: it is faithful (it is literally what the engine read), the text is
selectable, the DOM is inspectable, picks are exact, and the same iframe serves Word and Markdown documents,
which the engine turns into HTML anyway. What a snapshot cannot do is *interact*: logins, clicks and
infinite scroll are **recorded** in a headed browser window instead (phase 5), and the snapshot is retaken
after each recorded step.

### 3.2 Picking

- **Pick mode**: hover outlines the element under the cursor and shows its candidate selector; a click
  creates a `Read` step (`extract`, `kind: css`).
- **A second click on a similar element infers the list**: the studio walks up from both elements to the
  nearest ancestors that are siblings with the same tag and class signature. That ancestor is the item
  (`article.product_pod`); the path from it to the clicked element is the field (`.price_color`). The
  studio then writes the safe shape by construction: `extract` the items with `take: html, many: true`, a
  `forEach` over them, and each field read `from` the item. The wrapper trap and the shifted-field bug of
  `authoring.md` §4.5 cannot be built this way.
- **Selectors are portable CSS**, with XPath as the fallback. Playwright's own selector generator is not
  usable: it emits `internal:role=…` selectors that only Playwright understands, while recipes also run in
  api mode through cheerio. The studio's generator ranks candidates: `id` and `data-*` attributes, then
  stable class tokens, then structure, and a position (`nth-of-type`) only as a last resort. Every
  candidate is **verified** by running it through the engine's own selection on the snapshot and on the
  live page, and the card shows the match count.
- **Hidden elements** are part of the snapshot. A toggle shows them (greyed) so a value the page keeps in a
  hidden node, a `<meta>` or a `data-*` attribute can be picked. In api mode the engine reads them like any
  other node; in web mode `take: text` follows what the browser renders. The card says which.

### 3.3 The Inspect panel

A DOM tree of the snapshot, beside the rendered view, like a browser's inspector but of the engine's view:

- every node with its attributes, hidden nodes greyed, the picked ones highlighted in their colour;
- **data in the page**: `<script type="application/ld+json">`, `<script type="application/json">`,
  inline state (`window.__STATE__ = …`) and `<meta>` values, listed apart, each one pickable as a `regex` or
  `jsonpath` read;
- **responses the page fetched** while rendering (what `probe` already captures): pick one to switch the
  recipe to api mode on that endpoint;
- clicking a node in the tree is the same as clicking it in the view.

### 3.4 Documents

The editor pane never changes; only the canvas on the left does:

| Source | Canvas | A click produces |
|---|---|---|
| Word, Markdown | the snapshot iframe, on the HTML the engine makes | the same CSS picks as on a page |
| JSON, YAML, XML | a tree | a `jsonpath` (or `xpath`); a value inside a list generalises to the list; a "next" value gives the `paginate` cursor |
| PDF | the page rendered by pdf.js with the engine's cells and rows drawn on it (the code exists in `docs/how-it-works/capture/capture.mjs`, `pdfFigure`) | the header row gives the table's `selector`, the last row `until`, a column its name, a dragged region a `regex` scope |
| Excel, CSV | a grid of the engine's workbook: sheet tabs, hidden sheets and rows marked, merged cells shown | a sheet tab gives `sheet`, the header row `headerRows`, the first non-data row `until`, a merged group `fillDown` |
| PowerPoint | each slide redrawn from the shapes' boxes, with its tables and charts listed | a native table gives `table` with `slide`; a text-box grid `shapes: true`; a chart a `jsonpath` to its series |

## 4. The editor pane

Three tabs: **Steps**, **Record**, **JSON**. A preview strip runs along the bottom of the window.

### 4.1 Steps: an outline of cards

The model is Apple Shortcuts, not a flowchart: a recipe is a script with nested scopes, and an outline shows
exactly that.

- Each step is a card that reads as a sentence: *Go to…*, *Read… from…*, *For each… in…*, *For every
  page…*, *If…*, *Fill… with…*, *Click…*.
- Container steps (`forEach`, `paginate`, `if`) are brackets; their children are indented inside them.
  **The indentation is the scope**: a card can only use pills from cards above it in the same bracket or an
  outer one, so the binding errors the loader reports cannot be built.
- **Pills** are the ids (`books`, `book`, `title`), each in a colour; the same colour outlines its matches
  in the content pane. Hover a card, its matches light up with a count; click on the left in pick mode, the
  card fills in.
- A card expands to its full form, generated from the JSON Schema: `onError`, `take`, `many`, timeouts. The
  sentence stays short; the details are one click away.
- `＋` rows between cards offer: Go to, Read, Loop, Next page, If, Fill form, Click, Log in. "Read" puts the
  content pane in pick mode.

### 4.2 Record: the output recipe and the mapping

A table of the output fields: name, type, source pill, transform chain, key and required toggles.

- Drag a pill from Steps onto a field to map it.
- The transform chain is a row of small blocks with **the real value between each one**, from the last
  sample: the mapping trace core emits under `debug` (`record:emit.mapping`, shipped in 0.1.12).
- A transform that fails turns red with the engine's reason; a missing value shows which policy applied.

### 4.3 JSON

The files, live, with schema validation and completion. Edits here re-render the outline; unknown
constructs render as a grey "custom" card there instead of disappearing.

### 4.4 The preview strip

- **Records**: the sample's output, one column per field, missing values marked.
- **Trace**: the engine's own `traceLine` output, streamed as the sample runs.
- **Why?**: click an empty cell and get a sentence built from the events: *"`price` is missing: `Read price`
  matched nothing inside item 3; the item has `.price_new`."* The mapping trace gives the value read, the
  step events give the step that bound the id and whether it was skipped, and the snapshot of the item
  gives the hint.

## 5. Package layout

Scaffolded with `@mnci/cli` (`react-app`, `npm-lib`), never by hand. The server follows the vertical
slice rules of `docs/architecture/vertical-feature-slices.md`; the app folder is organised by the same
feature names, one folder per feature, even though `apps/` is outside the lint's scope.

```text
packages/studio/                 @opencraw/studio: the server, published; bin `opencraw-studio`
  src/
    studio-api/                  the contracts the UI and the server share (zod): commands, events, view models
    studio-server/               HTTP and WebSocket handlers, token, static UI; `main.ts`
    recipe-workspace/            load a recipe folder, watch it, save with round-trip, validate (core's loaders)
    sample-run/                  run with a budget, stream events, keep the last run's trace and records
    page-snapshot/               Playwright/HTTP capture, URL rewriting, script stripping, hidden marks, node ids
    selector-inference/          candidates, ranking, list inference from two picks, verification (pure)
    scope-outline/               the outline model of a recipe: cards, brackets, ids in scope at a path
    document-view/               PDF cells, workbook grid and deck view models from core's documents
    page-inspector/              DOM tree, data in the page, responses seen (from the cli's probe)
    flow-recording/              (phase 5) the headed browser, recorded actions to steps
apps/studio/                     the React UI (Vite, Chakra UI); built into packages/studio/dist/ui
  src/
    app/                         shell: toolbar, split layout, preview strip
    content-pane/                snapshot iframe, picker overlay, canvases (tree, pdf, grid, deck)
    steps-outline/               cards, brackets, pills, forms from the schema
    record-editor/               fields, mapping, transform chain
    json-editor/
    preview/                     records, trace, why
    inspector/
    studio-client/               the API client, WebSocket, shared types from @opencraw/studio
```

The cli gains a `studio` command that imports `@opencraw/studio` lazily and says how to install it when it is
missing, so the cli stays light.

## 6. Phases and deliverables

Each phase is one issue, one branch, one release. The deliverable line says what you can do at the end of
it that you could not before. Sizes: S (days), M (a week or two), L (more).

### Phase 0: the walking skeleton (M, [#89](https://github.com/russoedu/open.craw/issues/89))

- Scaffold `packages/studio` and `apps/studio`; the server serves the UI; the token; the WebSocket.
- `recipe-workspace`: open a folder, list its recipes, validate them with core's loader, show issues.
- `sample-run`: run one input recipe with a budget (`maxRecords`, `maxPages`, a time cap) and `debug: true`,
  stream `traceLine` output and records.
- UI: the shell with the split layout and the preview strip; the **JSON tab** with schema validation; the
  content pane shows the **raw fetched or rendered HTML** of the start page (no picking yet).
- **Deliverable:** open a recipe folder in the browser, run a sample, read the records and the trace next to
  the page. A visual runner, already useful for debugging.

### Phase 1: the Steps outline (M, [#90](https://github.com/russoedu/open.craw/issues/90))

- `scope-outline`: recipe → cards and brackets; ids in scope at a path; unknown steps → custom cards.
- UI: the outline, sentence cards, pills, expand to the schema form, `＋` menus, drag to reorder within a
  bracket; every edit writes the JSON and re-validates; the JSON tab and the outline stay in sync.
- **Deliverable:** write and change a web or api recipe without touching JSON, with binding errors shown on
  the card that causes them.

### Phase 2: picking on web pages (L, [#91](https://github.com/russoedu/open.craw/issues/91))

- `page-snapshot`: capture after the selected step; rewrite; hidden marks; node ids.
- `selector-inference`: candidates, ranking, two-click list inference, verification with match counts.
- UI: the snapshot iframe with the picker overlay; pick → Read card; second pick → loop; hover ↔ highlight
  in both directions; the hidden-elements toggle.
- **Deliverable:** click a price and a title on books.toscrape.com and get a recipe that runs and emits 20
  records. This is the riskiest part, so it comes right after the skeleton.

### Phase 3: the Record tab (M, [#92](https://github.com/russoedu/open.craw/issues/92))

- UI: the fields table, types from the schema, key and required, missing-value policy; drag a pill to map;
  the transform chain with the values from the last sample's mapping trace; errors in place.
- Preview: **Why?** on a missing or rejected value.
- **Deliverable:** define the output and the mapping visually, and see every transform's effect on real
  values.

### Phase 4: the Inspect panel (S, [#93](https://github.com/russoedu/open.craw/issues/93))

- `page-inspector`: DOM tree, data in the page, responses seen (the cli's `probe` findings).
- UI: the tree beside the view; hidden nodes greyed; pick from the tree; switch to api mode from a response.
- **Deliverable:** find and pick values that are not visible on the page.

### Phase 5: documents (M, one sub-phase per canvas, [#94](https://github.com/russoedu/open.craw/issues/94))

- 5a JSON, YAML, XML tree; 5b PDF canvas (port `pdfFigure`); 5c workbook grid; 5d deck.
- `document-view` builds each view model from core's documents; each pick writes the matching `extract`.
- **Deliverable:** point at a table in a PDF, a sheet or a deck and get the `table` extract that reads it.

### Phase 6: recording flows (L, [#95](https://github.com/russoedu/open.craw/issues/95))

- `flow-recording`: a headed Playwright window the studio controls; clicks, typing, selects and key presses
  become steps; "make this the login" moves them to `session.bootstrap`; a recorded click on a next link
  offers `paginate`; the snapshot is retaken after each step.
- **Deliverable:** record a login and a search, then pick the results, all without writing a step by hand.

### Phase 7: the desktop app (M, [#96](https://github.com/russoedu/open.craw/issues/96))

- Electron shell around the same UI and server; the content pane becomes a live embedded browser where a
  snapshot is not enough; logins in place with cookies saved to `storageState`; signed builds.
- **Deliverable:** an installable app for people who do not use a terminal.

Phases 4 and 5 can run in parallel with 3; 6 and 7 come last because they depend on everything before them.

## 7. Testing

- **Unit tests** beside every production file, as in every package (`*.test.ts`, Jest). The pure slices
  (`selector-inference`, `scope-outline`, `document-view`) are the ones to cover hardest: list inference on
  DOM fixtures with nested and shifted fields, shadow DOM, late content; outline round-trips (recipe →
  outline → recipe is the identity on every example recipe in the repository).
- **Component tests** for the UI with Testing Library, with the runner mnci generates for a `react-app`.
- **End-to-end** with Playwright, in `packages/studio/e2e/`, against the engine's fixture site
  (`packages/core/e2e/fixture-site.ts`, moved to an internal lib the two packages share): start the studio
  on the fixture, click through the browser, and assert the recipe written to disk and the sample's records.
  One scenario per phase deliverable, so the deliverable line is a test.
- **The guide's recipes** are the corpus: every recipe under `docs/how-it-works/recipes/` and `examples/`
  must open in the studio, render as an outline with no custom card where the studio claims support, and
  round-trip unchanged.
- `docs:check` keeps running; a studio page joins the guide when phase 2 ships.

## 8. Security

- The server binds `127.0.0.1` and requires the token on every request; no CORS.
- The snapshot has no scripts; the iframe is sandboxed; a CSP forbids anything but the studio's own origin.
- Hooks load only through the same `--hooks` module the cli takes; nothing in a recipe folder is executed.
- Credentials are referenced by access profile name or `{{env.X}}`; the studio never stores one.
- Sample runs go through the crawler's `allowedHosts` like any run; the studio shows the allowlist and
  refuses to fetch outside it.
- The recorder's browser profile is the studio's own, never the user's default profile.

## 9. Changes the engine needs

Small, and each one useful on its own:

- `recipe-loading`: expose the ids in scope at a step path (the binding validator computes it already).
- `crawl-execution`: a sample budget in `CrawlOptions` (records, pages, time) that stops cleanly and is
  reported, instead of the studio faking it with `limits`.
- `crawl-events`: `step:start` and `step:end` carry the step's path and the page snapshot id, so the studio
  can align a card with a trace line and a snapshot.
- `selection`: a "verify selector" entry point (count matches on a document) the studio can call without
  building a recipe.
- The cli's `probe` findings move to a place `@opencraw/studio` can import without depending on the cli,
  or the studio depends on the cli (to decide in phase 4).

## 10. Decisions still open

1. The design: colours, icons, whether the preview strip stays at the bottom. The rough sketches, one per
   phase, are under [`docs/assets/research/`](../assets/research/): `studio-skeleton`, `studio-steps`,
   `studio-record`, `studio-inspect`, `studio-pdf`, `studio-recorder`; the design pass replaces them.
2. The name: `@opencraw/studio` and `opencraw studio`.
3. Whether the recorder (phase 6) should come before documents (phase 5): documents are cheaper and safer;
   the recorder unlocks logins.
4. Whether phase 7 (Electron) is planned now or when phases 0 to 3 have shipped.
