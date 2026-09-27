<p align="center">
  <img src="../assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# Policies

[← How OpenCraw works](README.md) · Previous: [8. Mapping and transforms](07-mapping-and-transforms.md) · Next: [10. Running](09-running.md)

After its transforms, each field's value is coerced to the field's type and validated. Four things can go
wrong on the way, and each one ends in one of two ways:

| What went wrong | Example | Who decides |
|---|---|---|
| The value is **missing** | a season with no overtime losses recorded | the missing-value policy, in full precedence |
| The value **can't be coerced** | a relative link into a `url` field | the same policy, in full precedence |
| The value **fails validation** | `3` in a field with `min: 5` | the same policy, but only `skip-record` helps |
| A **transform throws** | the `integer` transform on an empty cell, a hook that throws | the mapping rule's own `onMissing` only |

The two endings: the record is **rejected** (`RecordRejectedError`: it is dropped, counted, and the walk goes
on), or the mapping **fails** (`MappingFailedError`: the step that emitted fails, and by default the recipe
stops). This page shows each case on real data. The reference is
[authoring.md §7](../recipes/authoring.md#7-policies-what-happens-when-something-is-missing-or-fails).

## What counts as missing

A value is missing when it is `undefined` (the path isn't there, `regex` found no match, `first` of an empty
list), `null`, or `""`. An empty list is a value. An `object` field that ends up with no members is missing too.

Blank text, `""` or only spaces, is missing in a field of every type except `string` and `json`. An empty table
cell mapped into an `integer`, `number`, `currency`, `date`, `boolean`, `url` or `enum` field is missing, so the
field's `default`, `null` or its policy applies: it is never a coercion error, and a `boolean` field doesn't turn
it into `false`. A `string` or `json` field keeps text as it is, so there `""` is missing and `"  "` is a value.
The [precedence](#the-precedence) scene below maps an empty cell into `integer` fields with no transform.

An explicit `number` or `integer` **transform** is another matter: it is asked to read a number, and blank text
has none, so it throws (see [transform failures](#transform-failures-look-only-at-the-rule)).

## The precedence

When a field's value is missing, the policy comes from the first of these that is set:

1. the mapping rule's `onMissing` (in the input recipe);
2. the field's `onMissing` (in the output recipe);
3. `default`, when the field has a `default` value;
4. the output recipe's `onMissing`;
5. built in: `fail` when the field is `required`, `null` otherwise.

The rule comes first because it belongs to one site: an input recipe can relax or tighten a field for its own
source without changing the shared output recipe.

The hockey table on [scrapethissite.com](https://www.scrapethissite.com/pages/forms/?q=Boston) leaves the "OT
Losses" column empty before 1999, when the league started counting overtime losses. The scene reads Boston's
seasons from 1997 to 2001 ([recipes](recipes/policy-precedence)) into an output recipe whose `onMissing` is
`skip-record`, with four `integer` fields fed from the same cell, with no transform. Before 1999 the cell is
empty, and blank text in an `integer` field is missing:

```json
"onMissing": "skip-record",
"fields": {
  "otLosses":      { "type": "integer", "default": 0 },
  "otLossesField": { "type": "integer", "default": 0, "onMissing": "null" },
  "otLossesRule":  { "type": "integer", "default": 0, "onMissing": "default" },
  "otLossesNote":  { "type": "integer", "default": "-1" }
}
```

and in the input recipe, `"otLossesRule": { "from": "ot", "onMissing": "null" }`.

<!-- capture:policy-precedence records n=3 -->
```json
{"team":"Boston Bruins","year":1997,"otLosses":0,"otLossesField":null,"otLossesRule":null,"otLossesNote":-1}
{"team":"Boston Bruins","year":1998,"otLosses":0,"otLossesField":null,"otLossesRule":null,"otLossesNote":-1}
{"team":"Boston Bruins","year":1999,"otLosses":6,"otLossesField":6,"otLossesRule":6,"otLossesNote":6}
```
<!-- /capture -->

<!-- capture:policy-precedence mapping fields=otLosses,otLossesRule record=0 -->
| Field | Step | Value |
|---|---|---|
| `otLosses` | read | `""` |
| | **field** | `0` |
| `otLossesRule` | read | `""` |
| | **field** | `null` |
<!-- /capture -->

For 1997 and 1998, with the cell empty:

- `otLosses`: no rule or field policy, and the field has a `default`, so step 3 applies: `0`. The output
  recipe's `skip-record` (step 4) is never reached, which is why no season is dropped.
- `otLossesField`: the field's own `onMissing: "null"` (step 2) comes before its `default`: `null`.
- `otLossesRule`: the field says `default`, the rule says `null`, and the rule wins (step 1): `null`.
- `otLossesNote`: step 3 again, with the `default` written as the text `"-1"`. A `default` is coerced to its
  field's type like a mapped value, so the field holds the integer `-1`.

From 1999 the cell has a number, and no policy is consulted.

The loader coerces and validates every `default` before anything runs. With `"default": "not recorded"` on
`otLossesNote`, `loadRecipeSet` rejects the set with a `RecipeBindingError`, and no page is requested:

```text
recipes do not bind
  ot-season fields.otLossesNote.default: "not recorded" is not a valid default: integer field: no number in "not recorded"
```

A `default` that breaks the field's `min`, `max` or `pattern` fails the same way, and so does
`onMissing: "default"` on a field (or a rule) whose field has no `default`.

## The four policies

| Policy | Effect on a missing value |
|---|---|
| `skip-record` | `RecordRejectedError`: the record is dropped, `rejected` is counted, a `record:reject` event (`✖` in the trace) names the field, and the walk goes on. |
| `fail` | `MappingFailedError`: the step that emitted fails, and goes through its `onError`. |
| `null` | The field is `null`, when it is `nullable` or not `required`. A required field that isn't `nullable` fails instead. |
| `default` | The field's `default`, coerced to the field's type (`"0"` in a `number` field is `0`). The loader checks it: a `default` the field can't take, or a `default` policy on a field without one, is a `RecipeBindingError`. |

The output recipe's own `onMissing` takes only `fail`, `skip-record` or `null`; `default` belongs to a field.

## One missing tag, three outcomes

Page 3 of the quotes API on [quotes.toscrape.com](https://quotes.toscrape.com/api/quotes?page=3) has a quote
with no tags: its eighth, by J.K. Rowling. Three input recipes read pages 3 and 4 into the same output recipe,
whose `mainTag` is `required` and mapped with `first` on the tags, so it is missing for that quote
([recipes](recipes/policy-quotes)):

- `quotes-reject` puts `"onMissing": "skip-record"` on the `mainTag` rule;
- `quotes-skip-step` has no policy, and `"onError": { "policy": "skip" }` on the emitting `forEach`;
- `quotes-stop` has no policy anywhere, so the built-in `fail` applies.

<!-- capture:policy-quotes summary -->
```text
quotes-reject: 19 emitted, 1 rejected, 0 duplicates, 2 pages
quotes-skip-step: 17 emitted, 0 rejected, 0 duplicates, 2 pages
quotes-stop: 7 emitted, 0 rejected, 0 duplicates, 1 pages, stopped: step steps.2 (forEach) failed: mapping failed: mainTag: missing
```
<!-- /capture -->

<!-- capture:policy-quotes trace grep=✖|↷|■ -->
```text
  ✖ record rejected: mainTag: missing
■ quotes-reject: 19 emitted, 1 rejected, 0 duplicates, 2 pages, … ms
  ↷ steps.2  forEach  skipped: mapping failed: mainTag: missing
■ quotes-skip-step: 17 emitted, 0 rejected, 0 duplicates, 1 steps skipped, 2 pages, … ms
  ✖ step steps.2 (forEach) failed: mapping failed: mainTag: missing
■ quotes-stop: 7 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.2 (forEach) failed: mapping failed: mainTag: missing
```
<!-- /capture -->

**`quotes-reject`: the record is rejected.** The quote is dropped and counted, and the walk goes on to the
next quote and to page 4: 19 records and 1 rejected. The captured records show the rejected one in its place,
with the field and the reason:

<!-- capture:policy-quotes records n=9 -->
```json
{"text":"“I love you without knowing how, or when, or from where. I love you simply, without problems or pride: I love you in this way because I do not know any other…","author":"Pablo Neruda","mainTag":"love"}
{"text":"“For every minute you are angry you lose sixty seconds of happiness.”","author":"Ralph Waldo Emerson","mainTag":"happiness"}
{"text":"“If you judge people, you have no time to love them.”","author":"Mother Teresa","mainTag":"attributed-no-source"}
{"text":"“Anyone who thinks sitting in church can make you a Christian must also think that sitting in a garage can make you a car.”","author":"Garrison Keillor","mainTag":"humor"}
{"text":"“Beauty is in the eye of the beholder and it may be necessary from time to time to give a stupid or misinformed beholder a black eye.”","author":"Jim Henson","mainTag":"humor"}
{"text":"“Today you are You, that is truer than true. There is no one alive who is Youer than You.”","author":"Dr. Seuss","mainTag":"comedy"}
{"text":"“If you want your children to be intelligent, read them fairy tales. If you want them to be more intelligent, read them more fairy tales.”","author":"Albert Einstein","mainTag":"children"}
{"rejected":{"field":"mainTag","reason":"missing"}}
{"text":"“Logic will get you from A to Z; imagination will get you everywhere.”","author":"Albert Einstein","mainTag":"imagination"}
```
<!-- /capture -->

<!-- capture:policy-quotes trace lines=14 -->
```text
▶ quotes-reject (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://quotes.toscrape.com/api/quotes?page=3
  · steps.0  request  … ms
  · steps.1  extract quotes  … ms
  ✚ record (no key)
  ✚ record (no key)
  ✚ record (no key)
  ✚ record (no key)
  ✚ record (no key)
  ✚ record (no key)
  ✚ record (no key)
  ✖ record rejected: mainTag: missing
  ✚ record (no key)
  …
```
<!-- /capture -->

**`quotes-stop`: the mapping fails, and the recipe stops.** A `MappingFailedError` isn't handled where the
record is made. It rejects inside the step that emitted, here the `forEach`, which fails as a whole, not only
the one iteration. The `forEach` has no `onError`, and neither has the recipe, so the policy is `fail`: the
recipe stops with the error in its report (`errorKind: "mapping"`) and a `✖ stopped` line. The seven records
written before stay in the sink. Page 4 is never read: it is a second start point of the same recipe, and the
recipe has stopped. Another input recipe in the same run still runs, unless the crawler was created with
`onRecipeError: "stop"`.

**`quotes-skip-step`: the step is skipped.** With `onError: skip` on the `forEach`, the failure becomes a
`step:skip` (`↷`). The walk goes on after the `forEach`, and page 4 is read. But the whole `forEach` was
skipped: the two quotes after Rowling's on page 3 were never mapped, so the recipe has 17 records, not 19. Use
`skip-record` to drop one record; `onError` acts on steps. (The `summary` above doesn't count skipped steps;
the `■` line in the trace does.)

## Coercion failures follow the full precedence

A value that can't be converted to the field's type goes through the same precedence as a missing one (fixed
in [#65](https://github.com/russoedu/open.craw/issues/65): before, the output recipe's `onMissing` was
ignored). If it resolves to `skip-record`, the record is rejected. **Anything else fails the mapping**: a
`null` or `default` policy doesn't replace a value that is there but wrong.

The scene maps the first three links of books.toscrape.com's Mystery category, as the page writes them
(`../../../sharp-objects_997/index.html`), into a `url` field, which needs an absolute URL
([recipes](recipes/policy-coercion)). The output recipe's `onMissing` is `skip-record`. `link-as-is` maps the
link as it is; `link-null` adds `"onMissing": "null"` to the rule:

<!-- capture:policy-coercion summary -->
```text
link-as-is: 0 emitted, 3 rejected, 0 duplicates, 1 pages
link-null: 0 emitted, 0 rejected, 0 duplicates, 1 pages, stopped: step steps.2 (forEach) failed: mapping failed: url: "../../../sharp-objects_997/index.html" is not an absolute URL (use the absoluteUrl transform)
```
<!-- /capture -->

<!-- capture:policy-coercion records n=3 -->
```json
{"rejected":{"field":"url","reason":"\"../../../sharp-objects_997/index.html\" is not an absolute URL (use the absoluteUrl transform)"}}
{"rejected":{"field":"url","reason":"\"../../../in-a-dark-dark-wood_963/index.html\" is not an absolute URL (use the absoluteUrl transform)"}}
{"rejected":{"field":"url","reason":"\"../../../the-past-never-ends_942/index.html\" is not an absolute URL (use the absoluteUrl transform)"}}
```
<!-- /capture -->

<!-- capture:policy-coercion trace grep=▶|✖ -->
```text
▶ link-as-is (api)
  ✖ record rejected: url: "../../../sharp-objects_997/index.html" is not an absolute URL (use the absoluteUrl transform)
  ✖ record rejected: url: "../../../in-a-dark-dark-wood_963/index.html" is not an absolute URL (use the absoluteUrl transform)
  ✖ record rejected: url: "../../../the-past-never-ends_942/index.html" is not an absolute URL (use the absoluteUrl transform)
▶ link-null (api)
  ✖ step steps.2 (forEach) failed: mapping failed: url: "../../../sharp-objects_997/index.html" is not an absolute URL (use the absoluteUrl transform)
■ link-null: 0 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.2 (forEach) failed: mapping failed: url: "../../../sharp-objects_997/index.html" is not an absolute URL (use the absoluteUrl transform)
```
<!-- /capture -->

For `link-as-is`, nothing is set on the rule or the field and there is no `default`, so the output recipe's
`skip-record` applies and each book is rejected. For `link-null`, the rule says `null`, which isn't
`skip-record`, so the first book fails the mapping and the recipe stops. The fix is the `absoluteUrl`
transform, which the error message names. The rejection holds the field and the reason apart; the trace line
joins them, with the field's path once.

## Transform failures look only at the rule

When a transform throws, the only policy consulted is the mapping rule's own `onMissing`, and only
`skip-record` counts: it reads as "without this field the record is worthless". The field's policy, its
`default` and the output recipe's `onMissing` are not consulted, and the mapping fails.

The same hockey seasons, 1997 to 2001, into an output recipe whose `onMissing` is `skip-record` and whose
`otLosses` is an `integer` field. Three input recipes map the empty cell three ways
([recipes](recipes/policy-transform)):

- `ot-integer-skip`: `integer` transform, `"onMissing": "skip-record"` on the rule;
- `ot-integer`: `integer` transform, nothing else;
- `ot-plain`: no transform.

<!-- capture:policy-transform summary -->
```text
ot-integer-skip: 3 emitted, 2 rejected, 0 duplicates, 1 pages
ot-integer: 0 emitted, 0 rejected, 0 duplicates, 1 pages, stopped: step steps.2 (forEach) failed: mapping failed: otLosses: transform "integer": no number in ""
ot-plain: 3 emitted, 2 rejected, 0 duplicates, 1 pages
```
<!-- /capture -->

<!-- capture:policy-transform trace grep=▶|✖ -->
```text
▶ ot-integer-skip (api)
  ✖ record rejected: otLosses: transform "integer": no number in ""
  ✖ record rejected: otLosses: transform "integer": no number in ""
▶ ot-integer (api)
  ✖ step steps.2 (forEach) failed: mapping failed: otLosses: transform "integer": no number in ""
■ ot-integer: 0 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.2 (forEach) failed: mapping failed: otLosses: transform "integer": no number in ""
▶ ot-plain (api)
  ✖ record rejected: otLosses: missing
  ✖ record rejected: otLosses: missing
```
<!-- /capture -->

<!-- capture:policy-transform records n=5 -->
```json
{"rejected":{"field":"otLosses","reason":"transform \"integer\": no number in \"\""}}
{"rejected":{"field":"otLosses","reason":"transform \"integer\": no number in \"\""}}
{"team":"Boston Bruins","year":1999,"otLosses":6}
{"team":"Boston Bruins","year":2000,"otLosses":8}
{"team":"Boston Bruins","year":2001,"otLosses":9}
```
<!-- /capture -->

- `ot-integer-skip`: the `integer` transform throws on `""`: it was asked for a number and there is none. The
  rule says `skip-record`, so 1997 and 1998 are rejected, and 1999 to 2001 kept.
- `ot-integer`: the same error, and the rule says nothing. The output recipe's `skip-record` isn't consulted
  for a transform failure, so the first season stops the recipe.
- `ot-plain`: no transform, so no transform failure. `""` reaches the `integer` field, where blank text is
  missing ([What counts as missing](#what-counts-as-missing)). Nothing on the rule or the field, and no
  `default`, so the output recipe's `skip-record` applies: the two seasons are rejected as `missing`.

An `integer` field reads the number itself, so a transform that only does the same adds a way to fail. Keep the
`number` transform for what the field can't do, such as reading with a `locale`, or before a step that needs a
number (`sum`), and give its rule `skip-record` when the cell can be empty.

## Validation failures

After coercion, a present value is checked against the field's rules: `min` and `max` for numbers,
`minLength`, `maxLength` and `pattern` for text, `minLength` and `maxLength` for arrays
([authoring.md §1.1](../recipes/authoring.md#11-field-spec)). A value that breaks one is resolved like a
coercion failure: the policy in full precedence, `skip-record` rejects the record, anything else fails the
mapping (`mapping failed: n: 3 is below the minimum 5`). None of this guide's sites gave a value out of range,
so there is no captured example.

## Rejected or failed

| | `RecordRejectedError` | `MappingFailedError` |
|---|---|---|
| Raised by | `skip-record` for a missing, unconvertible or invalid value; a transform failure with the rule's `skip-record` | every other policy for those; a transform failure without the rule's `skip-record`; `each` over something that isn't a list |
| Message | `record rejected: <field>: <reason>` | `mapping failed: <field>: <reason>` |
| Event | `record:reject` with `field`, `reason`, and the snapshot under `debug` | with `fail`, `error` and then `recipe:finish` with `error`; with `skip`, `step:skip` |
| Report | `rejected` + 1 | with `fail`, `error` and `errorKind: "mapping"`; with `skip`, `stepsSkipped` + 1 |
| The walk | goes on; `maxRecords` counts only emitted records | the emitting step fails through its `onError`: `fail` (the default) stops the recipe, `skip` skips the whole step |
| Records written before | kept | kept |

## The items of `each`

An `each` rule builds a list of objects, and each member of each item goes through the same steps as a field:
coercion, validation, then the missing-value policy with its `default`. The precedence is the same too, with the
rule inside `each.fields` first. A problem is reported at the item's index (`variants[1].size`).

PokeAPI lists the abilities a Pokémon had in older generations. For Bulbasaur the one entry has
`"ability": null`, because its hidden ability didn't exist before generation V:

<!-- capture:policy-each-gap scope ids=past -->
```json
{
  "past": [
    {
      "generation": {
        "name": "generation-iv",
        "url": "https://pokeapi.co/api/v2/generation/4/"
      },
      "abilities": [
        {
          "is_hidden": true,
          "slot": 3,
          "ability": null
        }
      ]
    }
  ]
}
```
<!-- /capture -->

The output recipe makes `name` required in each item ([recipes](recipes/policy-each-gap)). Two input recipes
map it: `pokeapi-past` sets no policy, and `pokeapi-past-skip` puts `"onMissing": "skip-record"` on the `name`
rule inside `each.fields`:

<!-- capture:policy-each-gap summary -->
```text
pokeapi-past-skip: 0 emitted, 1 rejected, 0 duplicates, 1 pages
pokeapi-past: 0 emitted, 0 rejected, 0 duplicates, 1 pages, stopped: step steps.3 (emit) failed: mapping failed: pastAbilities[0].name: missing
```
<!-- /capture -->

<!-- capture:policy-each-gap trace grep=✖ -->
```text
  ✖ record rejected: pastAbilities[0].name: missing
  ✖ step steps.3 (emit) failed: mapping failed: pastAbilities[0].name: missing
■ pokeapi-past: 0 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.3 (emit) failed: mapping failed: pastAbilities[0].name: missing
```
<!-- /capture -->

With no policy anywhere, the required member's built-in `fail` applies and the recipe stops. With the rule's
`skip-record`, the record is rejected and the rejection names the member at its index:

<!-- capture:policy-each-gap record -->
```json
{
  "rejected": {
    "field": "pastAbilities[0].name",
    "reason": "missing"
  }
}
```
<!-- /capture -->

The loader checks `each` rules as well. A name in `each.fields` that the items don't have, or a required member
that no rule maps (and that has no `default`), is a `RecipeBindingError`. Renaming `name` to `title` in the rule
gives both:

```text
recipes do not bind
  pokeapi-past mapping.pastAbilities.fields.title: the items of "pastAbilities" have no field "title"
  pokeapi-past mapping.pastAbilities.fields: required field of the items of "pastAbilities" "name" is not mapped
```

## What's next

[Running](09-running.md): sessions, access, blocks, retries and the other things that decide whether a page
arrives at all.
