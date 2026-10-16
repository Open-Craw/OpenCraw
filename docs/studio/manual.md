<p align="center">
  <img src="../assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# The OpenCraw Studio manual

Studio is a visual editor for recipes: open a site or a document, click the data you want, and get a
recipe that runs. This guide builds one, start to finish — [books.toscrape.com](https://books.toscrape.com),
the same site [How OpenCraw works](../how-it-works/README.md) walks through, a site built for scraping
practice — without hand-writing a line of JSON. By the end you will have a working `input`/`output` recipe
pair and know your way around every tab.

If you would rather write recipes by hand, [`docs/recipes/authoring.md`](../recipes/authoring.md) is the
full reference; this guide is the other way in.

## Contents

1. [Install and start](#1-install-and-start)
2. [Opening a workspace](#2-opening-a-workspace)
3. [The shell](#3-the-shell)
4. [The Steps tab: picking on a live page](#4-the-steps-tab-picking-on-a-live-page)
5. [The Record tab: fields and mapping](#5-the-record-tab-fields-and-mapping)
6. [Running a sample](#6-running-a-sample)
7. [The Inspect panel: data that isn't on the page](#7-the-inspect-panel-data-that-isnt-on-the-page)
8. [Document canvases](#8-document-canvases)
9. [Recording a login](#9-recording-a-login)
10. [The JSON tab](#10-the-json-tab)
11. [Tips and troubleshooting](#11-tips-and-troubleshooting)

## 1. Install and start

Studio is its own package, kept separate from the engine so a plain crawl never pulls in a browser UI:

```sh
npm install -g @opencraw/cli @opencraw/studio
```

Start it on a folder of recipes (or an empty folder — see [§2](#2-opening-a-workspace)):

```sh
opencraw studio recipes/
# or, without the cli:
npx @opencraw/studio recipes/
```

Either prints the URL to open, with a random access token already in it:

```text
OpenCraw Studio: http://127.0.0.1:52341/?token=8f2a1c9e4b7d3f6a0e5c8b1d2a4f7e9c
Workspace: /home/you/project/recipes
```

Open that URL in a browser. The server only listens on `127.0.0.1` and only answers requests carrying that
token, so nothing else on your machine (or network) can reach it — see
[the plan's §8](../research/recipe-studio.md#8-security) for the full list of what it does and doesn't do.
Leave the terminal running; `Ctrl+C` stops the server. If you started it with `opencraw studio` and get
"the studio is not installed", `npm install @opencraw/studio` — the cli keeps it as an optional dependency
so a plain crawl install stays light.

## 2. Opening a workspace

The toolbar has three jobs, and each has one place:

| Button | Question it answers | What is in it |
|---|---|---|
| **Recipe ▾** | Which recipe am I editing? | the recipes in the open folder, **New recipe…**, **Open folder…** |
| **Load ▾** | What does it read? | **Document…**, **Web page (URL)…** |
| **Run sample** / **Stop** | Does it work? | runs the open recipe |

Next to them, **All changes saved** says the edits you make are written as you make them (the Steps tab, loading, creating a
recipe); it reads **Saving…** while a write is on its way. The **Record** and **JSON** tabs keep their edits
as a draft until you press their own **Save**, so a change there is not written before that.

**A recipe is an input and its output.** The input recipe (`<id>.ocw-in.json`) names its output recipe
(`<id>.ocw-out.json`, by the input's `output` id). Opening a recipe from **Recipe ▾** opens both: Steps edits the
input, Record edits the output and the mapping between them. You never open the pair separately.

**Opening a folder.** **Recipe ▾ → Open folder…** takes any folder — one that already has `.ocw-in.json` /
`.ocw-out.json` files in it, or a brand new one. It opens the operating system's folder dialog (the desktop app's native one, or the VS Code extension's own
dialog when Studio runs from there); on a machine with no dialog, a box to type the path in appears instead. Starting Studio
with `opencraw studio <folder>` opens that folder already.

**Starting from nothing?** **Recipe ▾ → New recipe…**: type an id (lowercase letters, digits and hyphens — the
same pattern every recipe id follows), optionally a start URL, and **Create**. That writes a minimal, valid
pair — `<id>.ocw-in.json` and `<id>.ocw-out.json` — into the open folder and selects it: a `web` recipe with one
`goto` step, an `emit`, and no fields mapped yet. Everything from here builds on top of that.

**Loading what it reads.** A page or a document is the sample a recipe is built against, so **Load ▾** puts it
into the recipe that is open:

- **Web page (URL)…** with a web recipe open replaces its start page; the steps and the mapping stay.
- **Document…** (or dropping a PDF, spreadsheet, CSV, PowerPoint, Word, Markdown, JSON, YAML or XML file
  anywhere on the window) with a document recipe open replaces the file it reads. The studio copies the file
  into the workspace folder, next to the recipes, so the folder stays self-contained.
- If the open recipe reads the other kind of thing — a document into a web recipe, or a page into a document
  recipe — or no recipe is open, Load starts a new recipe instead and leaves the open one untouched. A bar
  under the toolbar says which happened. New recipes are named after the file (`Q3 Report.pdf` → `q3-report`;
  a second one becomes `q3-report-2`) or the page's host, and a document opens on its own canvas
  ([§8](#8-document-canvases)).
- No folder open yet? Load needs one to write into: open one first.

For this guide's example, open any folder and create a recipe with the id `books`.

## 3. The shell

The window splits into three: the **content pane** on the left shows what the engine actually sees at the
recipe's start point (not a live, interactive copy of the site — see [§4](#4-the-steps-tab-picking-on-a-live-page)
for why); the **editor pane** on the right has three tabs, **Steps**, **Record** and **JSON**; a **preview
strip** runs along the bottom with the last sample's **Records**, its **Trace**, and (once something is
missing) a **Why?** explanation. Both the content/editor split and the workspace/preview split are
draggable.

The toolbar's recipe picker lists every `input` recipe in the open folder; **Run sample** crawls the
selected one with a small budget (a handful of pages and records) and streams the result into the preview
strip, live.

## 4. The Steps tab: picking on a live page

Open the **Steps** tab. A new recipe has one card: **Go to `https://example.com`** (the placeholder start
URL — edit its address field to `https://books.toscrape.com/catalogue/category/books/mystery_3/index.html`,
the Mystery category). A second card, **Emit**, closes the loop for now; you'll move it once there's
something to loop over.

The content pane does not load the live site — it loads a **snapshot the engine itself took** by running
the recipe up to that step (a real Playwright page for a `web` recipe, a real HTTP fetch for `api`), with
scripts stripped and every element marked with a stable id. That is deliberate: it is exactly what the
engine will read, so a pick here is a pick the engine reproduces exactly, byte for byte, every time it
runs — not a "close enough" guess at what you saw in a live browser.

Click **Read** above the content pane to enter pick mode, then hover over a book's title in the page. The
element under the cursor outlines, with its candidate CSS selector shown. Click it: a **Read** card appears
in the Steps outline — *Read `title` from `.product_pod h3 a` (attr: title)*.

Now click a **second** book's title. Studio walks up from both clicked elements to the nearest ancestors
that repeat with the same tag and class (`article.product_pod`), and rewrites the two single reads into a
safe loop by construction: an `extract` of every matching item, a `forEach` over them, and the field read
`from` each item — never the "wrapper trap" a hand-written selector can fall into (an ancestor that isn't
actually one-per-item). The outline now shows **Read `books`... → For each `book` in `books` → Read `title`
from `book`**.

Repeat picking inside that loop for a **price** (`.price_color`) and an **availability** (`.availability`)
on the same two books, each producing another **Read** card nested in the same `forEach`. Move the **Emit**
card (drag, or the `＋` menu's own **Emit**) inside the loop, after the reads, so one record comes out per
book instead of one for the whole page.

A card's **pill** — the small coloured `books`, `book`, `title` labels — is the id the next card downstream
can read `from`. Hovering a card highlights every matching element in the content pane with a count, so you
can confirm a selector actually matches what you expect before moving on. The document canvases do the same
in both directions: a tree node, a region of a PDF page or a slide, a chart, or a cell a step already reads
is marked with the step's id (a dashed box, a pill), hovering the card fills it in, and hovering the marked
node, line, text box, chart or cell lights the card up. Container steps (`forEach`,
`paginate`, `if`) draw as brackets around their children: a card can only use a pill from its own bracket or
an outer one, so the outline can never let you build a binding error the loader would later reject.

The `＋` row between any two cards (or at the end of a bracket) offers every step kind: **Go to**, **Read**,
**Loop**, **Next page**, **If**, **Fill form**, **Click**, **Set**, **Collect**, **Emit**. **Next page**
wraps everything already in the outline in a `paginate` bracket around a "next" link you then pick the same
way — turn it into one now around the whole loop, pointing at the category page's "next" link, and every
page of Mystery books feeds the same reads.

Every edit here — a pick, a move, a reorder — writes straight to the recipe's JSON file and re-validates
against the server's real loader (the same one `opencraw validate` uses): a binding problem shows on the
card that causes it, in place, not as a wall of text elsewhere.

**Hidden elements**: the **Show hidden** switch reveals (greyed) anything the snapshot marked as hidden on
the live page (`display: none`, zero size) — some sites keep a machine-readable value in a hidden node or a
`<meta>` tag that is easier to read than the rendered text.

## 5. The Record tab: fields and mapping

Switch to the **Record** tab. This is the paired **output** recipe: the fields a record actually has, each
with a type, and the input recipe's **mapping** — which pill each field reads from, and what happens to the
value on the way in.

A strip at the top of the tab lists every value the steps read that no field uses yet, one chip each:
the pill, the field it would become and a guessed type (`price` becomes a `number`, `availability` a
`boolean`, a link taken from `href` a `url` made absolute; hover a chip for why). Click a chip's **＋** to add
the field **and** its mapping at once, or **Add all**. Nothing is guessed silently: change a type or a name
afterwards like any field.

A recipe with output fields but no **Emit** step reads values and returns no records, so the tab says so and
offers **Add Emit step**.

Each field row opens with a one-line summary: a coloured **type** badge, the **pill** it reads from (or
*not mapped*, *generated*) and, once a sample has run, the **value** the selected record got.

**Drag to build the output.** Anything you can see can be dropped on the field list to become a field with its
mapping, typed the way its proposal would be:

- a **pill** from a **Steps** card: grab it and hold it over the **Record** tab (it opens after a moment),
  then drop it on the list. Dropped on a field's own source box instead, it only maps that field;
- a **selection** staged in the content pane (a cell, a text box, a region of a PDF, a node of the page): drag
  its chip onto the **Record** tab and the list. The studio adds the step to the recipe, as dropping it on the
  Steps tab does, and the value it reads appears as a new field. The new field is a draft until you **Save**.

You can still add a field by hand with **+ field** and drag a **Steps** pill onto its row (or type the pill
name directly). Mark `title` as the record's **key**, so a duplicate never gets emitted twice.

Each field's **transform chain** is a row of small blocks — `trim`, `currency`, `boolean`, and so on
(the same closed set [§5.1 of the authoring guide](../recipes/authoring.md#51-transforms) documents) — add
one by clicking the row's own `＋`. After a sample has run (see [§6](#6-running-a-sample)), each block
shows the **real value** at that point, taken from the last run's mapping trace: read `"£47.82"`, after
`currency` → `{"amount":47.82,"currency":"GBP"}`. A transform that fails on a real value turns red with the
engine's own reason, right on the block that failed — no guessing which one from a stack trace.

## 6. Running a sample

Click **Run sample** in the toolbar. This is not a mocked preview: it is the same engine, in the same
process, running for real against a small budget (a few pages, a handful of records) so it finishes fast
while you're editing. The **Records** panel at the bottom fills in as they arrive — toggle between a
**Table** and a compact **JSONL** view, export what you see (JSON/JSONL/CSV), or **Enlarge** it into a full
window. The **Trace** panel streams the engine's own `traceLine` output live, one line per step, indented by
nesting — the exact same trace `opencraw run --trace` prints from the terminal.

Click an empty cell in the Records table (a field that came out missing) to get **Why?**: a plain-language
explanation built from the run's own events — which read matched nothing, on which item, and what
selectors were actually present nearby to try instead. **Stop** ends a run early; recipes with a start point
that changes each run (pagination, matrix variants) can be safely stopped mid-way without leaving anything
half-written, since nothing is saved until you click Save.

## 7. The Inspect panel: data that isn't on the page

Not everything worth reading is visible text. Click **Inspect** above the content pane to open a DOM tree of
the same snapshot, alongside the rendered view — a browser inspector, but of exactly what the engine reads,
with hidden nodes greyed the same way the content pane marks them.

Two more tabs live here:

- **Data in the page**: `<script type="application/ld+json">` blocks, inline JSON state
  (`window.__STATE__ = …`), and `<meta>` tags, listed apart from the DOM tree — click one to pick it as a
  `regex` or `jsonpath` read, often more reliable than a CSS selector on rendered text that a redesign could
  break.
- **Responses seen**: every JSON response the page fetched while it rendered (the same findings
  `opencraw probe` reports from the terminal). Picking one switches the recipe from `web` mode to `api`
  mode on that endpoint directly — usually faster and steadier than driving a browser at all, when a site's
  data already arrives as clean JSON.

Clicking a node in either the DOM tree or a finding is the same pick a click in the content pane would be:
it lands the same kind of **Read** card in the Steps outline.

## 8. Document canvases

The editor pane never changes — Steps, Record and JSON work the same regardless of source. Only the content
pane's **canvas** changes, to fit what it's actually showing:

| Source | Canvas | A click gives you |
|---|---|---|
| A web page, or Word/Markdown (read as HTML) | the snapshot iframe from [§4](#4-the-steps-tab-picking-on-a-live-page) | a CSS selector |
| JSON, YAML, XML, JSON Lines | a tree — click a value to read it, `[*]` reads every item of a list | a `jsonpath` (or `xpath` for XML); a "next" value offers the `paginate` cursor |
| PDF | the page rendered with the engine's own detected cells and rows drawn over it | in **Text** mode (the default) the line under the mouse snaps; a click stages it (a wrapped paragraph is staged whole, and a line under a heading stages everything between that heading and the next, as a `section` extract: the chip says what it is tied to, and a box you draw says it is a fixed position that breaks when the layout moves), shift+click extends to another line, dragging stages the box drawn — a chip shows exactly what the engine reads there, with **Add to recipe** (a `region` extract: `page=1 x=72..252 y=640..664`; a `Label: value` line adds a `regex` extract named after its label that reads the value only, wherever it sits on the page) or drag the chip onto the Steps tab. The page is fitted to the pane's width. A worked example, with every step pictured and a narrated video, is [One recipe for two PDFs of one layout](./pdf-agreements.md). In the table modes, the header row gives `selector`, the last row `until`, a column its name |
| Excel, CSV | a grid: sheet tabs, hidden sheets/rows marked, merged cells shown as one | in **Cell** mode (the default) the cell under the mouse lights up; a click stages it, shift+click (or press on one cell and release on another) stages the rectangle between — the chip shows the values, with **Add to recipe** (a `jsonpath` into the sheet by name and the cell by position: `$.sheets[?(@.name=='Prices')].rows[0][0]`, a rectangle a list) or drag it onto the Steps tab. In the table modes a sheet tab gives `sheet`, the header row `headerRows`, a merged group `fillDown` |
| PowerPoint | each slide redrawn from its shapes, with tables and charts listed apart | in **Text** mode (the default) the text box under the mouse snaps; a click stages it, shift+click extends, dragging stages the box drawn — the same chip as the PDF's, with **Add to recipe** (a `region` extract: `slide=3 x=60..900 y=30..90`, points from the slide's top-left corner) or drag it onto the Steps tab. In the table modes a table gives `table`/`slide`; a chart a `jsonpath` into its series |

Every one of these writes the matching `extract` step the same way a page pick does — the outline, the
Record tab and the JSON tab don't know or care which canvas produced it.

## 9. Recording a login

Some data sits behind a login, or needs a click, a search box filled in, or an infinite-scroll load — none
of which a static snapshot can do. Click **Record** above the content pane: a real, headed browser window
opens for you to drive by hand. A banner across the top tracks what you've done as you go; every click,
fill, select and key press you make in that window becomes a step, live.

When you're done, **Stop recording**. Two ways to keep what you did:

- **Make this the login**: moves the recorded steps into the recipe's `session.bootstrap` — they run once,
  before the crawl proper, to obtain cookies the rest of the recipe reuses. Use this for an actual sign-in.
- **Keep as steps**: appends them to the recipe's own `steps`, in place, the same as if you'd built them
  with the Steps tab's `＋` menu. Use this for something that's part of the crawl itself, not a one-time
  setup (a search box, an infinite-scroll trigger).

**Discard** throws the recording away. Either way, the content pane's snapshot is retaken after the
recording closes, so the next pick reflects whatever state the page ended up in.

## 10. The JSON tab

The recipe's file, live, in a real code editor (syntax highlighting, multi-cursor with `Ctrl`/`Cmd`-`D`,
search with `Ctrl`/`Cmd`-`F`) rather than a plain text box — with the server's own validation, from the same
loader `opencraw validate` uses, shown as inline markers at the exact spot each issue is about. Anything the
Steps/Record tabs cannot yet express (a construct they don't have a card for) still round-trips here as
readable JSON — nothing is ever silently dropped for being "too advanced" for the visual editors. Edit here
and the other tabs pick it up on the next save; edit there and this tab shows exactly what got written,
so the two never drift out of sync.

## 11. Tips and troubleshooting

- **"Playwright's Chromium is not downloaded yet"**: the first time a `web` recipe needs a browser and none
  is installed, the studio installs one for you automatically and retries — you'll see a line about it in
  the terminal the studio is running in. If it can't (offline, no permission), it says so with the exact
  command to run yourself: `npx playwright install chromium`.
- **A pick lands in the wrong place**: a pick always adds to the *end* of the recipe's top-level steps, not
  inside whichever bracket happens to be open in the Steps tab — drag the new card into place afterward, or
  build the loop first (as in [§4](#4-the-steps-tab-picking-on-a-live-page)) and pick from inside it.
- **Nothing to pick from**: an empty response, a page that needs JavaScript the snapshot didn't wait for, or
  a login wall are all signs to reach for [§7](#7-the-inspect-panel-data-that-isnt-on-the-page)'s "responses
  seen" tab or [§9](#9-recording-a-login)'s recorder before assuming the data isn't reachable at all.
- **The recipe files are the truth.** Nothing the studio does is hidden state: close it, and every pick,
  every mapping, every transform is sitting in the JSON files exactly as saved. `opencraw validate` and
  `opencraw run` work on them the same as any hand-written recipe.

## 12. Letting an agent drive Studio

An AI agent connected to OpenCraw's MCP server (see the VS Code extension's *AI agent* view) can work in the Studio you have open, so you watch it
happen instead of reading a report:

- **`studio_status`** tells it whether Studio is running, which folder it has open and what it is sampling.
- **`studio_open_recipe`** opens a recipe, a folder or a document in your Studio, as if you had followed a link to it.
- **`studio_pick`** picks a value on a web page for you to see: by CSS selector or by the text it shows. It is staged the way your own click is, with the
  ways to find it to choose from, and the agent can add it to the recipe.
- **`studio_run_sample`** runs an input recipe as a sample: the records arrive in your Records tab, and the agent gets the counts and the first
  records back.

Nothing needs setting up: a running Studio announces itself in `~/.opencraw/studio` (its address and its access token, readable only by you), and the
agent finds it there. Studio still listens on this machine only. On a PDF, a spreadsheet or a deck the picking is still your click: the agent tells you where.
