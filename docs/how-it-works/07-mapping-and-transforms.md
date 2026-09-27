<p align="center">
  <img src="../assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# Mapping and transforms

[← How OpenCraw works](README.md) · Next: [9. Policies](08-policies.md)

When a step emits, the engine takes a snapshot of the scope: every id bound so far, plus `page`, `start` and
`vars`. The input recipe's `mapping` turns that snapshot into a record. Each output field has a rule, and the
engine runs these four stages for each one:

1. **Read**: `from` picks a value out of the snapshot (or `each` builds a list of objects).
2. **Transform**: the rule's `transform` ops run in order, each on the previous one's result.
3. **Coerce**: the value is converted to the field's type (`integer`, `currency`, `url`…) and validated.
4. **Policy**: a missing value, or one that can't be converted, is settled by the missing-value policy. That
   is the [next page](08-policies.md).

This page covers the first two stages, and every transform, with values from real runs. The reference for
each key and op is [authoring.md §5](../recipes/authoring.md#5-mapping); this page shows what they do to data.

## The mapping trace

The tables on this page are not written by hand. With `CrawlOptions.debug`, every `record:emit` event carries
two extra things: `scope`, the snapshot the mapping read, and `mapping`, one entry per mapped field:

```js
const crawler = createCrawler({
  debug:   true,
  onEvent: (event) => {
    if (event.type === 'record:emit') console.log(event.mapping.price)
    // { from: '£47.82', steps: [{ op: 'currency', value: { amount: 47.82, currency: 'GBP' } }] }
  },
})
```

- An entry is keyed by the mapping target: `price`, `stock.inStock` for a dotted target, `tags[1].url` for a
  field of the second item built by `each`.
- `from` is the value as read, before any transform. `steps` has one `{ op, value }` per transform, holding the
  value after that op.
- An op that was skipped because the value was missing is still listed, with no value (*(missing)* in the
  tables below).
- The trace stops before coercion. What the field finally holds can differ from the last step, which is why
  every table here ends with a **field** row taken from the record.
- Generated fields (`now`, `uuid`, `sourceUrl`, `recipeId`) are not traced, and a `record:reject` event
  carries the snapshot but no mapping trace.

Here it is on a book's detail page from [books.toscrape.com](https://books.toscrape.com)
([recipe](recipes/map-books-detail/mystery-detail.input.json)). The product table's cells are read into one
list, `info`, and several fields pick from it:

<!-- capture:map-books-detail mapping fields=price,tax record=0 -->
| Field | Step | Value |
|---|---|---|
| `price` | read | `"£47.82"` |
| | `currency` | `{"amount":47.82,"currency":"GBP"}` |
| | **field** | `{"amount":47.82,"currency":"GBP"}` |
| `tax` | read | `["e00eb4fd7b871a48","Books","£47.82","… 4 more"]` |
| | `nth` | `"£0.00"` |
| | `regex` | `"0.00"` |
| | `currency` | `{"amount":0}` |
| | **field** | `{"amount":0,"currency":"GBP"}` |
<!-- /capture -->

`tax` shows the gap between the last step and the field. The text `£0.00` goes through `regex`, which keeps
`0.00` without the pound sign, so `currency` can't find a currency and returns `{ "amount": 0 }`. The field
declares `"currency": "GBP"`, and coercion adds it. The trace shows the value before that, and the record
shows it after.

## `from`: where a rule reads

`from` is a path into the snapshot. It can start with any id bound by a step (`title`, `info`), a `forEach`
variable (`quote`), `page` (`{ url, number }`), `start` or `vars`. Dots walk into objects and `[n]` into lists
(`quote.author.name`, `abilities[0].ability.name`). A path that doesn't exist gives a missing value; it never
throws.

`.` is the whole snapshot at the top level, and the item itself inside `each` (below).

**Several sources.** `from` can be a list of paths. The rule then reads a **list** of their values in that
order, keeping missing ones as missing, and the transforms decide what to do with it: `concat`, `coalesce`,
`flatten`, `join`. The quotes API of [quotes.toscrape.com](https://quotes.toscrape.com/api/quotes?page=1)
([recipe](recipes/map-quotes-api/quotes-api.input.json)) gives the text and the author separately, and
`citation` puts them together:

<!-- capture:map-quotes-api mapping fields=citation record=6 -->
| Field | Step | Value |
|---|---|---|
| `citation` | read | `["“It is better to be hated for what you are than to be loved for what you are not.”","André Gide"]` |
| | `replace` | `["It is better to be hated for what you are than to be loved for what you are not.","André Gide"]` |
| | `concat` | `"It is better to be hated for what you are than to be loved for what you are not. — André Gide"` |
| | **field** | `"It is better to be hated for what you are than to be loved for what you are not. — André Gide"` |
<!-- /capture -->

`replace` ran on both items: it is elementwise (see [How a chain runs](#how-a-chain-runs)). The author's name
has no curly quotes, so it is left as it is.

## Dotted targets: building objects

A mapping key with dots writes into an object. `stock.inStock` and `stock.available` build `stock`, which the
output recipe declares as an `object` with those two `fields`:

```json
"stock.inStock":   { "from": "availability", "transform": [{ "op": "boolean" }] },
"stock.available": { "from": "info", "transform": [{ "op": "nth", "index": -2 }, { "op": "regex", "pattern": "(\\d+) available" }, { "op": "integer" }] }
```

<!-- capture:map-books-detail record record=0 -->
```json
{
  "url": "https://books.toscrape.com/catalogue/sharp-objects_997/index.html",
  "title": "Sharp Objects",
  "slug": "sharp-objects",
  "upc": "E00EB4FD7B871A48",
  "category": "Mystery",
  "path": "Books / Mystery",
  "price": {
    "amount": 47.82,
    "currency": "GBP"
  },
  "tax": {
    "amount": 0,
    "currency": "GBP"
  },
  "stock": {
    "inStock": true,
    "available": 20
  },
  "stars": 4,
  "reviews": 0,
  "hasReviews": false,
  "image": "https://books.toscrape.com/media/cache/c0/59/c05972805aa7201171b8fc71a5b00292.jpg"
}
```
<!-- /capture -->

Each member is coerced, validated and given the missing-value policy on its own, under its dotted path, so an
error names `stock.available`. A member the output doesn't declare is dropped. The quotes recipe does the same
for `author.name`, `author.slug` and `author.url`.

## `each`: a list of objects

`each` names a list in the snapshot and builds one object per item, with its own `fields` rules. Inside them
`from` is relative to the item, and `.` is the item itself, which is the only way to read an item that is a
plain string. A quote's `tags` is such a list:

```json
"tags": { "each": "quote.tags", "fields": {
  "name": { "from": "." },
  "url":  { "from": ".", "transform": [{ "op": "absoluteUrl", "base": "https://quotes.toscrape.com/tag/" }] }
}}
```

The trace has one entry per item and field, keyed with the item's index:

<!-- capture:map-quotes-api mapping fields=tags[0].name,tags[0].url,tags[1].name,tags[1].url record=6 -->
| Field | Step | Value |
|---|---|---|
| `tags[0].name` | read | `"life"` |
| | **field** | `"life"` |
| `tags[0].url` | read | `"life"` |
| | `absoluteUrl` | `"https://quotes.toscrape.com/tag/life"` |
| | **field** | `"https://quotes.toscrape.com/tag/life"` |
| `tags[1].name` | read | `"love"` |
| | **field** | `"love"` |
| `tags[1].url` | read | `"love"` |
| | `absoluteUrl` | `"https://quotes.toscrape.com/tag/love"` |
| | **field** | `"https://quotes.toscrape.com/tag/love"` |
<!-- /capture -->

- A `lookup` table or a `template` path inside `fields` is looked up in the item first, then in the record's
  snapshot, so a table extracted once per page stays reachable from every item.
- A `null` or missing list gives a missing field. Something that isn't a list fails the mapping
  (`"quote.tags" is not a list`).
- The `each` rule itself has no trace entry, only its items' fields.
- Each member of an item is coerced, validated and given its missing-value policy and `default`, like a field,
  and reported at its index (`tags[1].url`): see [Policies](08-policies.md#the-items-of-each). The loader checks
  that every name in `fields` is a member of the items, and that every required member is mapped.

## Joins

`lookup` joins two extractions at mapping time: it finds the value in a table that another step bound and
returns a column of the matching row. The book's rating is a class name (`star-rating Four`); the recipe binds
a table of words and numbers once, with `set`, and `stars` looks the word up in it:

<!-- capture:map-books-detail mapping fields=stars record=0 -->
| Field | Step | Value |
|---|---|---|
| `stars` | read | `"star-rating Four"` |
| | `regex` | `"Four"` |
| | `lookup` | `4` |
| | **field** | `4` |
<!-- /capture -->

The keys are compared as text, so `"4"` finds `4`. The table can be data, JSON text or a list of JSON texts,
and it can come from anywhere in the snapshot. The quotes API sends the site's ten most used tags as pairs
(`["love", 14]`), and `tagPopularity` looks up each of a quote's tags in them, reading the pairs' `0` and `1`
as paths:

```json
"tagPopularity": { "from": "quote.tags", "transform": [{ "op": "lookup", "in": "topTags", "key": "0", "pick": "1" }] }
```

<!-- capture:map-quotes-api mapping fields=tagPopularity record=6 -->
| Field | Step | Value |
|---|---|---|
| `tagPopularity` | read | `["life","love"]` |
| | `lookup` | `[13,14]` |
| | **field** | `[13,14]` |
<!-- /capture -->

<!-- capture:map-quotes-api mapping fields=tagPopularity record=0 -->
| Field | Step | Value |
|---|---|---|
| `tagPopularity` | read | `["change","deep-thoughts","thinking","world"]` |
| | `lookup` | `[null,null,null,null]` |
| | **field** | `[null,null,null,null]` |
<!-- /capture -->

`lookup` is elementwise, so a list of tags gives a list of counts. A tag that isn't in the top ten gives a
missing value in its place, which shows as `null` in JSON. More on joins, including a table of JSON texts read
from `data-*` attributes, in [authoring.md §5.2](../recipes/authoring.md#52-joining-two-extractions).

## How a chain runs

The ops run in order, each on the previous result. Two rules decide what an op receives.

**Elementwise or whole.** A *scalar* op given a list runs on each item and returns a list; a *list* op runs on
the list as a whole.

| Kind | Ops |
|---|---|
| scalar (elementwise over a list) | `trim` `lowercase` `uppercase` `replace` `regex` `split` `number` `integer` `boolean` `currency` `date` `absoluteUrl` `urlEncode` `lookup` |
| list (the whole value) | `join` `concat` `first` `last` `nth` `slice` `coalesce` `default` `flatten` `unique` `sum` `count` `template` `jsonpath` `group` `hook` |

Elementwise goes one level deep: `split` on a list gives a list of lists. The items themselves aren't checked
for missing values, so `trim` on `["a ", null]` fails with `transform "trim": expects text, got null`.

**Missing values.** When the value so far is missing (`undefined` or `null`), every op is skipped except
`default`, `template` and `hook`. A missing value therefore travels to the end of the chain untouched and
reaches the missing-value policy. An empty string is not skipped: `trim` on `""` gives `""`.

`numberInText` looks for a number in each quote, with `regex` and then `number`. On most quotes there is none:

<!-- capture:map-quotes-api mapping fields=numberInText record=0 -->
| Field | Step | Value |
|---|---|---|
| `numberInText` | read | `"“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.”"` |
| | `regex` | *(missing)* |
| | `number` | *(missing)* |
| | **field** | `null` |
<!-- /capture -->

<!-- capture:map-quotes-api mapping fields=numberInText record=7 -->
| Field | Step | Value |
|---|---|---|
| `numberInText` | read | `"“I have not failed. I've just found 10,000 ways that won't work.”"` |
| | `regex` | `"10,000"` |
| | `number` | `10000` |
| | **field** | `10000` |
<!-- /capture -->

On Einstein's quote, `regex` finds no match and returns a missing value, `number` is skipped, and the field is
not required, so the built-in policy makes it `null`. On Edison's, `regex` returns group 1, `10,000`, and
`number` reads it as `10000` (the comma is followed by three digits, so it is a thousands separator).

## Text

| Op | Does |
|---|---|
| `trim`, `lowercase`, `uppercase` | What the name says. Accept text, numbers and booleans; anything else fails. |
| `regex` | The first match. Returns group 1 when the pattern has a group, else the whole match; `group` picks another. `flags` apply, except `g`, which is removed. **No match gives a missing value**, not an error; a `group` the pattern doesn't have is an error. |
| `replace` | Every match replaced (flags `g` by default). `$1` to `$9` and `$&` in `replacement` are expanded. Setting `flags` replaces the default, so `"flags": "i"` replaces only the first match: write `"gi"`. |
| `split` | Text to a list, on a literal separator. |
| `join`, `concat` | A list to text. Missing items become empty text, numbers and booleans are written out, objects fail. `concat` is `join` with no separator by default. |
| `template` | Renders a `{{ }}` template against the snapshot. **It ignores its input**; a template that is exactly one placeholder returns the value with its type. |
| `urlEncode` | Percent-encodes one URL component (`encodeURIComponent`). |
| `absoluteUrl` | Resolves a link against `base`, or else the page the record was emitted on. |

**`trim`.** Text taken with `take: "text"` has its whitespace collapsed already; `trim` matters for inner HTML,
JSON and regex results. The hockey table of [scrapethissite.com](https://www.scrapethissite.com/pages/forms/)
([recipe](recipes/map-hockey-numbers/boston-seasons.input.json)) is read with `take: "html"`:

<!-- capture:map-hockey-numbers mapping fields=team record=0 -->
| Field | Step | Value |
|---|---|---|
| `team` | read | `"\n                            Boston Bruins\n                        "` |
| | `trim` | `"Boston Bruins"` |
| | **field** | `"Boston Bruins"` |
<!-- /capture -->

**`lowercase`, `replace`, `uppercase`.** A slug from the book's title, and the UPC from the product table's
first cell:

<!-- capture:map-books-detail mapping fields=slug,upc record=1 -->
| Field | Step | Value |
|---|---|---|
| `slug` | read | `"In a Dark, Dark Wood"` |
| | `lowercase` | `"in a dark, dark wood"` |
| | `replace` | `"in-a-dark-dark-wood"` |
| | **field** | `"in-a-dark-dark-wood"` |
| `upc` | read | `["19ed25f4641d5efd","Books","£19.63","… 4 more"]` |
| | `first` | `"19ed25f4641d5efd"` |
| | `uppercase` | `"19ED25F4641D5EFD"` |
| | **field** | `"19ED25F4641D5EFD"` |
<!-- /capture -->

**`regex`.** The number of copies inside "In stock (20 available)", then `integer`:

<!-- capture:map-books-detail mapping fields=stock.available record=0 -->
| Field | Step | Value |
|---|---|---|
| `stock.available` | read | `["e00eb4fd7b871a48","Books","£47.82","… 4 more"]` |
| | `nth` | `"In stock (20 available)"` |
| | `regex` | `"20"` |
| | `integer` | `20` |
| | **field** | `20` |
<!-- /capture -->

**`replace`, `split`.** An author's page on quotes.toscrape.com gives the birthplace as "in Yate, South
Gloucestershire, England, The United Kingdom" ([recipe](recipes/map-quotes-authors/quote-authors.input.json)).
`replace` drops the leading "in "; `split` and `last` keep the country:

<!-- capture:map-quotes-authors mapping fields=birthplace,country record=1 -->
| Field | Step | Value |
|---|---|---|
| `birthplace` | read | `"in Yate, South Gloucestershire, England, The United Kingdom"` |
| | `replace` | `"Yate, South Gloucestershire, England, The United Kingdom"` |
| | **field** | `"Yate, South Gloucestershire, England, The United Kingdom"` |
| `country` | read | `"in Yate, South Gloucestershire, England, The United Kingdom"` |
| | `split` | `["in Yate","South Gloucestershire","England","The United Kingdom"]` |
| | `last` | `"The United Kingdom"` |
| | **field** | `"The United Kingdom"` |
<!-- /capture -->

**`join`, `urlEncode`, `template`.** André Gide's quote: its tags joined, his name encoded for a query string,
and an Open Library search URL built by `template`, which reads the name from the snapshot and ignores the
value it's given (`urlEncode` inside the braces is the template function, not the op):

```json
"openLibrary": { "from": "quote.author.name", "transform": [{ "op": "template", "value": "https://openlibrary.org/search.json?author={{ urlEncode(quote.author.name) }}" }] }
```

<!-- capture:map-quotes-api mapping fields=tagList,authorQuery,openLibrary record=6 -->
| Field | Step | Value |
|---|---|---|
| `tagList` | read | `["life","love"]` |
| | `join` | `"life, love"` |
| | **field** | `"life, love"` |
| `authorQuery` | read | `"André Gide"` |
| | `urlEncode` | `"Andr%C3%A9%20Gide"` |
| | **field** | `"Andr%C3%A9%20Gide"` |
| `openLibrary` | read | `"André Gide"` |
| | `template` | `"https://openlibrary.org/search.json?author=Andr%C3%A9%20Gide"` |
| | **field** | `"https://openlibrary.org/search.json?author=Andr%C3%A9%20Gide"` |
<!-- /capture -->

**`absoluteUrl`.** Without `base`, a link resolves against the page the record came from, here the book's
page. The quotes API gives Goodreads paths, which need `base`:

<!-- capture:map-books-detail mapping fields=image record=0 -->
| Field | Step | Value |
|---|---|---|
| `image` | read | `"../../media/cache/c0/59/c05972805aa7201171b8fc71a5b00292.jpg"` |
| | `absoluteUrl` | `"https://books.toscrape.com/media/cache/c0/59/c05972805aa7201171b8fc71a5b00292.jpg"` |
| | **field** | `"https://books.toscrape.com/media/cache/c0/59/c05972805aa7201171b8fc71a5b00292.jpg"` |
<!-- /capture -->

<!-- capture:map-quotes-api mapping fields=author.url record=0 -->
| Field | Step | Value |
|---|---|---|
| `author.url` | read | `"/author/show/9810.Albert_Einstein"` |
| | `absoluteUrl` | `"https://www.goodreads.com/author/show/9810.Albert_Einstein"` |
| | **field** | `"https://www.goodreads.com/author/show/9810.Albert_Einstein"` |
<!-- /capture -->

## Numbers and dates

| Op | Does |
|---|---|
| `number` | Reads the one number in a text; a number passes through. No number, or two or more, is an error. |
| `integer` | `number`, then drops the fraction (`12.9` → `12`). |
| `currency` | `{ amount, currency }`: the amount as `number` reads it, and the code from the `currency` arg, else an ISO 4217 code written next to the amount (`USD 12.50`), else a symbol (`€ £ ¥ ₹ ₩ R$ US$ CA$ A$ $`), else an ISO 4217 code anywhere in the text. No code found gives `{ amount }` only. |
| `date` | A date object. With `format`, numeric text in the tokens `YYYY MM DD HH mm ss`; without, text as JavaScript's `Date` reads it (ISO is the safe choice). Text without a zone is read as UTC, or in `timezone` when given. |
| `boolean` | `true` or `false`, never an error. |

**`number` reads one number.** It finds the number in the text, with its sign, and ignores what's around it:
that is why `£47.82`, `Price: 1.299,00 €` or `In stock (20 available)` work. A text with no number, or with
two or more, is an error that names them, rather than a guess. An author's birth date holds two, and the
scene's `authors-as-number` recipe maps it with `number` alone
([recipe](recipes/map-quotes-authors/authors-as-number.input.json)). The rule has no `skip-record`, so the
transform failure stops the recipe at its first author:

<!-- capture:map-quotes-authors summary -->
```text
authors-as-number: 0 emitted, 0 rejected, 0 duplicates, 2 pages, stopped: step steps.2 (forEach) failed: mapping failed: bornAsNumber: transform "number": "March 14, 1879" holds 2 numbers (14, 1879): pick one with a "regex" transform first
quote-authors: 3 emitted, 0 rejected, 1 duplicates, 5 pages
```
<!-- /capture -->

(`quote-authors` is the scene's main recipe; its duplicate is Albert Einstein, who wrote two of the first
quotes.) The fix is the one the message names: cut out the number you want with `regex`, then read it:

<!-- capture:map-quotes-authors mapping fields=bornYear record=0 -->
| Field | Step | Value |
|---|---|---|
| `bornYear` | read | `"March 14, 1879"` |
| | `regex` | `"1879"` |
| | `number` | `1879` |
| | **field** | `1879` |
<!-- /capture -->

**Without a `locale`, `number` guesses the separators.** With both `.` and `,` in the number, the last one is
the decimal separator (`1.299,50` is `1299.5`). A single one is a thousands separator only when exactly three
digits follow it and one to three digits other than a lone `0` precede it, so `1.299` is `1299`, but `0.607`
and `10,00` are decimals. A separator repeated in groups of three (`1,234,567`) groups thousands, and one that
makes no sense (`1.2.3`) is an error. The hockey table's win percentage has two or three decimals, and reads the
same with or without `"locale": "en-US"`:

<!-- capture:map-hockey-numbers mapping fields=winPct,winPctEnglish record=0 -->
| Field | Step | Value |
|---|---|---|
| `winPct` | read | `"0.55"` |
| | `number` | `0.55` |
| | **field** | `0.55` |
| `winPctEnglish` | read | `"0.55"` |
| | `number` | `0.55` |
| | **field** | `0.55` |
<!-- /capture -->

<!-- capture:map-hockey-numbers mapping fields=winPct,winPctEnglish record=2 -->
| Field | Step | Value |
|---|---|---|
| `winPct` | read | `"0.607"` |
| | `number` | `0.607` |
| | **field** | `0.607` |
| `winPctEnglish` | read | `"0.607"` |
| | `number` | `0.607` |
| | **field** | `0.607` |
<!-- /capture -->

`0.607` has three digits after the point, which could be a group of thousands, but a lone `0` before it can't
start one. Give `locale` when a site writes numbers in a known format: it decides what the guess can't know,
that `1.299` is `1299` on a German page (`"locale": "de-DE"`) and `1.299` on an English one (`"en-US"`).

**`integer`.** The same parsing, so the same traps, then truncated. A signed goal difference and a year:

<!-- capture:map-hockey-numbers mapping fields=year,goalDiff record=1 -->
| Field | Step | Value |
|---|---|---|
| `year` | read | `"1991"` |
| | `integer` | `1991` |
| | **field** | `1991` |
| `goalDiff` | read | `"-5"` |
| | `integer` | `-5` |
| | **field** | `-5` |
<!-- /capture -->

**`currency`.** With a symbol, the code comes from the text. Without one, it comes from the field at
coercion, as shown for `tax` [above](#the-mapping-trace):

<!-- capture:map-books-detail mapping fields=price record=0 -->
| Field | Step | Value |
|---|---|---|
| `price` | read | `"£47.82"` |
| | `currency` | `{"amount":47.82,"currency":"GBP"}` |
| | **field** | `{"amount":47.82,"currency":"GBP"}` |
<!-- /capture -->

Two things to know: the field's `currency` **overrides** a code found in the text (there is no conversion),
and only an ISO 4217 code counts as one, so the capitals in `OTR £34,000` are ignored and the price reads as
`GBP`.

**`date`.** `format` knows only numeric tokens, and the site writes "March 14, 1879". The recipe calls a hook
first (`hook`, [below](#structure)) that rewrites it as `1879-03-14`, then `date`:

<!-- capture:map-quotes-authors mapping fields=born record=0 -->
| Field | Step | Value |
|---|---|---|
| `born` | read | `"March 14, 1879"` |
| | `hook` | `"1879-03-14"` |
| | `date` | `"1879-03-14T00:00:00.000Z"` |
| | **field** | `"1879-03-14"` |
<!-- /capture -->

The `date` op returns a date object, shown in the trace as an instant. The field is of type `date`, so coercion
writes the day; a `datetime` field would keep the instant, and a `string` field refuses a date object. Text
that names no zone (no `Z`, offset or `GMT`) is read as UTC, whatever the time zone of the machine running the
crawl; give `timezone` when the site writes local times.

**`boolean`.** Without `truthy`, the text is `true` when it is exactly `true`, `yes`, `y`, `1` or `on`, or
contains the words `in stock` or `available`; everything else is `false`, including `2`, `none` and
`unavailable`. With `truthy`, it is `true` when the text contains any of the phrases, as a substring, in any
case. A missing value skips the op, like any other, and stays missing: it doesn't become `false`.

<!-- capture:map-books-detail mapping fields=stock.inStock,hasReviews record=0 -->
| Field | Step | Value |
|---|---|---|
| `stock.inStock` | read | `"In stock (20 available)"` |
| | `boolean` | `true` |
| | **field** | `true` |
| `hasReviews` | read | `["e00eb4fd7b871a48","Books","£47.82","… 4 more"]` |
| | `last` | `"0"` |
| | `boolean` | `false` |
| | **field** | `false` |
<!-- /capture -->

<!-- capture:map-hockey-numbers mapping fields=winning record=0 -->
| Field | Step | Value |
|---|---|---|
| `winning` | read | `"pct text-success"` |
| | `boolean` | `true` |
| | **field** | `true` |
<!-- /capture -->

`hasReviews` reads the review count `0` as `false`. That works for zero and one; for two reviews it would be
`false` too. When the count matters, map it as an `integer`, as `reviews` does. The hockey table marks
winning seasons with a CSS class, and `truthy` matches it as a substring of `pct text-success`.

## Lists

| Op | Does |
|---|---|
| `first`, `last` | One item; `last` of `[]` is missing. |
| `nth` | `index` counts from 0; a negative one counts from the end (`-1` is the last). |
| `slice` | `start` and an optional `end`, as JavaScript's `slice` (negative counts from the end). |
| `flatten` | Nested lists into one, at any depth. |
| `unique` | Keeps the first of each value. Text is compared as text, anything else as its JSON, so `"1"` and `1` are the same. |
| `count` | The list's length. |
| `sum` | Adds numbers; any other item is an error, so convert text with `number` first. |
| `group` | `[{ key, items }]` by a path in each item, in first-seen order; items without the path go under `null`. |

`first`, `join`, `count` and the other ops that expect a list fail on a single value that isn't one
(`transform "first": expects a list, got string`).

**`first`, `last`, `nth`, `slice`.** The book's product table and breadcrumb, read as two lists:

<!-- capture:map-books-detail mapping fields=upc,reviews,category,path record=0 -->
| Field | Step | Value |
|---|---|---|
| `upc` | read | `["e00eb4fd7b871a48","Books","£47.82","… 4 more"]` |
| | `first` | `"e00eb4fd7b871a48"` |
| | `uppercase` | `"E00EB4FD7B871A48"` |
| | **field** | `"E00EB4FD7B871A48"` |
| `reviews` | read | `["e00eb4fd7b871a48","Books","£47.82","… 4 more"]` |
| | `last` | `"0"` |
| | `integer` | `0` |
| | **field** | `0` |
| `category` | read | `["Home","Books","Mystery","Sharp Objects"]` |
| | `nth` | `"Mystery"` |
| | **field** | `"Mystery"` |
| `path` | read | `["Home","Books","Mystery","Sharp Objects"]` |
| | `slice` | `["Books","Mystery"]` |
| | `join` | `"Books / Mystery"` |
| | **field** | `"Books / Mystery"` |
<!-- /capture -->

The cells are `UPC`, product type, two prices, tax, availability and reviews: `nth 4` is the tax, `nth -2` the
availability, `last` the reviews. `slice 1 -1` drops "Home" and the book's own title from the breadcrumb.

[PokeAPI](https://pokeapi.co) gives one JSON document per Pokémon
([recipe](recipes/map-pokeapi/pokeapi.input.json)). The recipe extracts lists and objects from it, and the
mapping works on them.

**`flatten`.** Two sources give a list of two lists; `flatten` makes one:

<!-- capture:map-pokeapi mapping fields=keywords record=0 -->
| Field | Step | Value |
|---|---|---|
| `keywords` | read | `[["grass","poison"],["overgrow","chlorophyll"]]` |
| | `flatten` | `["grass","poison","overgrow","chlorophyll"]` |
| | **field** | `["grass","poison","overgrow","chlorophyll"]` |
<!-- /capture -->

**`unique`, `count`.** `moveMethods` holds how each of the Pokémon's moves is learnt, one entry per move:

<!-- capture:map-pokeapi mapping fields=learnMethods,moveCount record=0 -->
| Field | Step | Value |
|---|---|---|
| `learnMethods` | read | `["egg","machine","machine","… 83 more"]` |
| | `unique` | `["egg","machine","tutor","level-up"]` |
| | **field** | `["egg","machine","tutor","level-up"]` |
| `moveCount` | read | `["egg","machine","machine","… 83 more"]` |
| | `count` | `86` |
| | **field** | `86` |
<!-- /capture -->

**`jsonpath`, `sum`.** `stats` is a list of objects; `jsonpath` takes the numbers and `sum` adds them:

<!-- capture:map-pokeapi mapping fields=statTotal record=0 -->
| Field | Step | Value |
|---|---|---|
| `statTotal` | read | `[{"base_stat":45,"effort":0,"stat":{"name":"hp","url":"https://pokeapi.co/api/v2/stat/1/"}},{"base_stat":49,"effort":0,"stat":{"name":"attack","url":"https://pokeapi.co/api/v2/stat/2/"}},{"base_stat":49,"effort":0,"s…` |
| | `jsonpath` | `[45,49,49,"… 3 more"]` |
| | `sum` | `318` |
| | **field** | `318` |
<!-- /capture -->

**`group`.** The abilities grouped by whether they are hidden:

<!-- capture:map-pokeapi mapping fields=abilitiesByHidden record=0 -->
| Field | Step | Value |
|---|---|---|
| `abilitiesByHidden` | read | `[{"is_hidden":false,"slot":1,"ability":{"name":"overgrow","url":"https://pokeapi.co/api/v2/ability/65/"}},{"is_hidden":true,"slot":3,"ability":{"name":"chlorophyll","url":"https://pokeapi.co/api/v2/ability/34/"}}]` |
| | `group` | `[{"key":false,"items":[{"is_hidden":false,"slot":1,"ability":"{…}"}]},{"key":true,"items":[{"is_hidden":true,"slot":3,"ability":"{…}"}]}]` |
| | **field** | `[{"key":false,"items":[{"is_hidden":false,"slot":1,"ability":"{…}"}]},{"key":true,"items":[{"is_hidden":true,"slot":3,"ability":"{…}"}]}]` |
<!-- /capture -->

The result goes into a `json` field here. It can also go into an `array` of `object` with `key` and `items`
members, which coercion fills item by item. `each` can't walk it: `each` reads a list from the snapshot, never
the output of a transform.

## Structure

| Op | Does |
|---|---|
| `jsonpath` | Runs a JSONPath on the value and always returns a list. It doesn't parse JSON text: extract with `kind: "jsonpath"` for that. |
| `lookup` | See [Joins](#joins). No match, or a table that isn't there, gives a missing value. |
| `coalesce` | The first item of a list that isn't missing or blank text. |
| `default` | Replaces `undefined`, `null` or `""` with `value`. An empty list is a value, and is kept. Runs on missing values. |
| `hook` | Calls a function registered with `createCrawler({ hooks })` with the value so far. Runs on missing values; whatever it throws is a transform failure. |

**`jsonpath`, `first`.** The hidden ability, found with a filter:

<!-- capture:map-pokeapi mapping fields=types,hiddenAbility record=1 -->
| Field | Step | Value |
|---|---|---|
| `types` | read | `[{"slot":1,"type":{"name":"electric","url":"https://pokeapi.co/api/v2/type/13/"}}]` |
| | `jsonpath` | `["electric"]` |
| | `join` | `"electric"` |
| | **field** | `"electric"` |
| `hiddenAbility` | read | `[{"is_hidden":false,"slot":1,"ability":{"name":"static","url":"https://pokeapi.co/api/v2/ability/9/"}},{"is_hidden":true,"slot":3,"ability":{"name":"lightning-rod","url":"https://pokeapi.co/api/v2/ability/31/"}}]` |
| | `jsonpath` | `["lightning-rod"]` |
| | `first` | `"lightning-rod"` |
| | **field** | `"lightning-rod"` |
<!-- /capture -->

**`coalesce`.** The female sprite when there is one, else the default one. Bulbasaur has no female sprite
(`null`), Pikachu has:

<!-- capture:map-pokeapi mapping fields=sprite record=0 -->
| Field | Step | Value |
|---|---|---|
| `sprite` | read | `[null,"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png"]` |
| | `coalesce` | `"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png"` |
| | **field** | `"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png"` |
<!-- /capture -->

<!-- capture:map-pokeapi mapping fields=sprite record=1 -->
| Field | Step | Value |
|---|---|---|
| `sprite` | read | `["https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/female/25.png","https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png"]` |
| | `coalesce` | `"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/female/25.png"` |
| | **field** | `"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/female/25.png"` |
<!-- /capture -->

**`default`.** Bulbasaur holds no item. `first` of an empty list is missing, and `default` fills it; applied to
the empty list itself, `default` keeps it, because an empty list is not missing:

<!-- capture:map-pokeapi mapping fields=heldItem,heldItems record=0 -->
| Field | Step | Value |
|---|---|---|
| `heldItem` | read | `[]` |
| | `first` | *(missing)* |
| | `default` | `"none"` |
| | **field** | `"none"` |
| `heldItems` | read | `[]` |
| | `default` | `[]` |
| | **field** | `[]` |
<!-- /capture -->

**`hook`.** Any function, sync or async, registered when the crawler is created. The authors scene registers
`monthDayYear`, which turns "March 14, 1879" into `1879-03-14` (the scene's version, in
[`capture/scenes/07-mapping.mjs`](capture/scenes/07-mapping.mjs), also throws on text it can't read):

```js
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

createCrawler({ hooks: {
  monthDayYear: (input) => {
    const [, month, day, year] = /^(\w+) (\d{1,2}), (\d{4})$/.exec(input)

    return `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`
  },
} })
```

```json
"born": { "from": "bornDate", "transform": [{ "op": "hook", "name": "monthDayYear" }, { "op": "date" }] }
```

A hook receives `(value, args, { recipeId, scope, log })`. Hooks belong to the crawler, not the recipe, so the
loader can't check a hook's name; `run` and `work` do, before the first request. A recipe that names a hook
nobody registered rejects with `UnknownHookError`, which says where the recipe uses it and which hooks are
registered (`quote-authors mapping.born.transform.0: unknown hook "monthDayYear" (no hooks registered)`).

## What's next

The values on this page all arrived. [Policies](08-policies.md) is about the ones that don't: a missing
value, a value that can't be converted, a transform that throws, and what each does to the record and the run.
