<p align="center">
  <img src="https://raw.githubusercontent.com/Open-Craw/OpenCraw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# From a movie to its lead actor's films

A navigation test: the entry point is one movie (Heat, 1995). The recipe finds the lead actor, follows the
link to the actor's page, and emits one record per film there. Two sites, TMDB and Letterboxd, reach the same
output by different routes and markup. Neither needs a browser.

## Run it

```sh
npm install
npm start                      # both sources
npm start -- --only tmdb       # or --only letterboxd
npm start -- --trace           # also print the route: pages, steps, records
```

In the OpenCraw repository, skip `npm install`: build the packages once at the root (`npm run core:build`) and
the example uses them. Ten films per source (`limits.maxRecords`) land in `out/filmography.jsonl`. The run
exits with an error when a recipe stops or nothing is written, so a site change is noticed.

## What's in it

| File | Route |
|---|---|
| `filmography.output.json` | `actor`, `title`, `year`, `role`, `entryMovie`, `filmUrl`, plus generated `source`, `url`, `scrapedAt`. Key: `actor` + `title` + `source`. |
| `tmdb-filmography.input.json` | Movie page JSON-LD gives the entry title; the "Top Billed Cast" scroller's first link is the lead actor; the person page's first credits table (Acting) is walked row by row: `td.year`, `td.role a bdi`, `span.character`. |
| `letterboxd-filmography.input.json` | Film page JSON-LD gives the entry title; `div.cast-list` first link is the lead actor; the "Films starring" poster grid is walked item by item, reading `data-item-name` ("The Godfather (1972)"), `data-item-link` and the `title` attribute ("... as Michael Corleone") for the role. |
| `run.mjs` | Loads the recipes, runs them, prints one line per record. |

What the recipes exercise in the engine:

- a `request` whose URL is a relative link (`/person/1158-al-pacino`, `/actor/al-pacino/`), resolved against
  the page it came from;
- `extract ... take: "html"` of a table or a grid, then a `forEach` over its rows or items with further
  `extract`s scoped to each fragment (`from: "row"`);
- transforms that split one attribute into two fields (`regex` for title and year from `"Name (1972)"`) and
  a missing-value policy for films without a year or a role (`nullable`).

## How the recipes were written

Netflix, the first choice for this test, could not be used: its search and person pages redirect to login.
TMDB and Letterboxd are public, server-rendered, and link movie → actor → films. Both recipes run in `api`
mode.

**Output** (`filmography.output.json`): `actor`, `title`, `year` (nullable integer), `role` (nullable),
`entryMovie`, `filmUrl`, plus generated `source`, `url`, `scrapedAt`. Key: `actor` + `title` + `source`.

### TMDB: walk table rows

```text
request  entry         https://www.themoviedb.org/movie/949-heat
extract  entry_ld      script[ld+json], many
extract  entry_title   from entry_ld  $[?(@['@type']=='Movie')].name        "Heat"
extract  actor_name    ol.people.scroller li.card p a                       "Al Pacino"  (first = top billed)
extract  actor_href    same, attr:href                                      "/person/1158-al-pacino"
request  actor_page    {{actor_href}}                                       relative, resolved against the movie page
extract  acting_table  table.card.credits, take html                        the first credits table = Acting
extract  rows          from acting_table  table.credit_group tr, many       one <tr> fragment per film
forEach  rows as row, emit
  extract title        from row  td.role a bdi
  extract film_href    from row  td.role a, attr:href
  extract year         from row  td.year          onError: skip
  extract role         from row  span.character   onError: skip
mapping  year: regex (\d{4}) → integer       "2026" → 2026, "—" → no match → null
         filmUrl: absoluteUrl                  resolved against the actor page
```

TMDB lists newest first, so the top rows are unreleased films with `—` for the year. The `regex` finds no
digits, the value is missing, the field is `nullable`, the record gets `null`. No policy on `title`: a row
without a title link means the markup changed.

### Letterboxd: walk grid items

```text
request  entry        https://letterboxd.com/film/heat-1995/
extract  entry_ld     script[type="application/ld+json"], many
extract  entry_title  from entry_ld  $[?(@['@type']=='Movie')].name
extract  actor_name   div.cast-list a.text-slug                              "Al Pacino"
extract  actor_href   same, attr:href                                        "/actor/al-pacino/"
request  actor_page   {{actor_href}}
extract  items        ul.grid li.griditem, take json (outer HTML), many
forEach  items as item, emit
  extract name        from item  div.react-component, attr:data-item-name     "The Godfather (1972)"
  extract link        from item  div.react-component, attr:data-item-link     "/film/the-godfather/"
  extract caption     from item  li.griditem, attr:title                      "The Godfather (1972) as Michael Corleone"
mapping  title: regex ^(.*?)(?: \(\d{4}\))?$    year: regex \((\d{4})\)$ → integer    role: regex  as (.+)$
```

Same output, different arithmetic: one attribute feeds two fields, and the role lives in the list item's
own `title` attribute, which is why the items are taken as outer HTML (`take: json`) and re-selected with
`li.griditem`.

### Result, verified

```text
tmdb       | Al Pacino | ---- | St. Vincent                      |
tmdb       | Al Pacino | ---- | Lear Rex                         | King Lear
tmdb       | Al Pacino | 2026 | Maserati: The Brothers           | Vincenzo Vaccaro
tmdb       | Al Pacino | 2026 | In the Hand of Dante             | Uncle Carmine
letterboxd | Al Pacino | 1972 | The Godfather                    | Michael Corleone
letterboxd | Al Pacino | 1983 | Scarface                         | Tony Montana
letterboxd | Al Pacino | 1995 | Heat                             | Lt. Vincent Hanna
letterboxd | Al Pacino | 2019 | The Irishman                     | Jimmy Hoffa
  tmdb: 10 emitted, 0 rejected, 2 pages, 3006 ms
  letterboxd: 10 emitted, 0 rejected, 2 pages, 2788 ms
```

### The bug worth remembering

The first TMDB run printed `St. Vincent | King Lear`. TMDB nests tables: `table.card.credits > tr > td >
table.credit_group > tr`. The selector `tr` matched the outer wrapper row first, whose inner HTML holds every
credit; "first `bdi`" gave St. Vincent and "first `span.character`" gave the *next* film's role. The real
St. Vincent row was then dropped as a duplicate key. No error anywhere: a shifted field. The selector is
`table.credit_group tr` now. Rule: on nested markup, select the innermost repeating element and check the
first record by hand.

### What this example changed in the engine

- A `request` with a relative URL resolves against the current page, like a link.
- CSS on an extracted fragment (`<tr>`, `<li>`) is parsed in fragment mode; the document parser was
  dropping table cells outside a table.
- JSON-LD wrapped in `/* <![CDATA[ */` or `<!-- -->` guards is unwrapped before parsing.

### The trace

`npm start -- --only tmdb --trace` prints the route the engine took:

```text
▶ tmdb (api)
  ⇢ page 1  https://www.themoviedb.org/movie/949-heat
  · steps.0  request entry  1561 ms
  · steps.1  extract entry_ld  54 ms
  · steps.2  extract entry_title  3 ms
  · steps.3  extract actor_name  31 ms
  · steps.4  extract actor_href  13 ms
  ⇢ page 1  https://www.themoviedb.org/person/1158-al-pacino
  · steps.5  request actor_page  1317 ms
  · steps.6  extract acting_table  38 ms
  · steps.7  extract rows  22 ms
    · steps.8.steps.0  extract title  1 ms
    · steps.8.steps.1  extract film_href  0 ms
    · steps.8.steps.2  extract year  1 ms
    ↷ steps.8.steps.3  extract role  skipped: no match for span.character
  ✚ record ["Al Pacino","St. Vincent","tmdb"]
    · steps.8.steps.0  extract title  1 ms
    · steps.8.steps.1  extract film_href  0 ms
  ...
■ tmdb: 10 emitted, 0 rejected, 0 duplicates, 2 pages, 3082 ms
```

Read it as the step tree: one indent level per nested `steps`, `⇢` a page fetched, `·` a step done with its
id and duration, `↷` a skip policy that fired, `✚` a record with its key, `■` the recipe summary.
