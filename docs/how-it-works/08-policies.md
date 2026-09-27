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
| A **transform throws** | `integer` on an empty cell, a hook that throws | the mapping rule's own `onMissing` only |

The two endings: the record is **rejected** (`RecordRejectedError`: it is dropped, counted, and the walk goes
on), or the mapping **fails** (`MappingFailedError`: the step that emitted fails, and by default the recipe
stops). This page shows each case on real data. The reference is
[authoring.md §7](../recipes/authoring.md#7-policies-what-happens-when-something-is-missing-or-fails).

## What counts as missing

A value is missing when it is `undefined` (the path isn't there, `regex` found no match, `first` of an empty
list), `null`, or `""`. An empty list is a value, and so is text made of spaces. An `object` field that ends
up with no members is missing too.

Coercion runs **before** the missing check, and it passes only `undefined` and `null` through. So `""` is
missing only in a field whose type accepts it: a `string` or `json` field. In an `integer`, `number`,
`currency`, `date`, `url` or `enum` field, `""` is a value that fails coercion (`no number in ""`), and in a
`boolean` field it becomes `false`. The [transform failures](#transform-failures-look-only-at-the-rule) section
shows it on a real table. To make an empty cell missing, end its chain with an op that returns a missing value
for it, such as `regex`.

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
`skip-record`, with four fields fed from the same cell, each through `regex (\d+)` so that the empty cell is
missing:

```json
"onMissing": "skip-record",
"fields": {
  "otLosses":      { "type": "integer", "default": 0 },
  "otLossesField": { "type": "integer", "default": 0, "onMissing": "null" },
  "otLossesRule":  { "type": "integer", "default": 0, "onMissing": "default" },
  "otLossesNote":  { "type": "integer", "default": "not recorded" }
}
```

and in the input recipe, `"otLossesRule": { "from": "ot", "transform": [...], "onMissing": "null" }`.

<!-- capture:policy-precedence records n=3 -->
```json
{"team":"Boston Bruins","year":1997,"otLosses":0,"otLossesField":null,"otLossesRule":null,"otLossesNote":"not recorded"}
{"team":"Boston Bruins","year":1998,"otLosses":0,"otLossesField":null,"otLossesRule":null,"otLossesNote":"not recorded"}
{"team":"Boston Bruins","year":1999,"otLosses":6,"otLossesField":6,"otLossesRule":6,"otLossesNote":6}
```
<!-- /capture -->

<!-- capture:policy-precedence mapping fields=otLosses,otLossesRule record=0 -->
| Field | Step | Value |
|---|---|---|
| `otLosses` | read | `""` |
| | `regex` | *(missing)* |
| | **field** | `0` |
| `otLossesRule` | read | `""` |
| | `regex` | *(missing)* |
| | **field** | `null` |
<!-- /capture -->

For 1997 and 1998, with the cell empty:

- `otLosses`: no rule or field policy, and the field has a `default`, so step 3 applies: `0`. The output
  recipe's `skip-record` (step 4) is never reached, which is why no season is dropped.
- `otLossesField`: the field's own `onMissing: "null"` (step 2) comes before its `default`: `null`.
- `otLossesRule`: the field says `default`, the rule says `null`, and the rule wins (step 1): `null`.
- `otLossesNote`: step 3, with a `default` that isn't an integer. It is written as it is: see
  [the gaps](#two-gaps-issue-78).

From 1999 the cell has a number, and no policy is consulted.

## The four policies

| Policy | Effect on a missing value |
|---|---|
| `skip-record` | `RecordRejectedError`: the record is dropped, `rejected` is counted, a `record:reject` event (`✖` in the trace) names the field, and the walk goes on. |
| `fail` | `MappingFailedError`: the step that emitted fails, and goes through its `onError`. |
| `null` | The field is `null`, when it is `nullable` or not `required`. A required field that isn't `nullable` fails instead. |
| `default` | The field's `default`, as written. A `default` policy on a field without a `default` leaves the field out of the record. |

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
link-null: 0 emitted, 0 rejected, 0 duplicates, 1 pages, stopped: step steps.2 (forEach) failed: mapping failed: url: url: "../../../sharp-objects_997/index.html" is not an absolute URL (use the absoluteUrl transform)
```
<!-- /capture -->

<!-- capture:policy-coercion records n=3 -->
```json
{"rejected":{"field":"url","reason":"url: \"../../../sharp-objects_997/index.html\" is not an absolute URL (use the absoluteUrl transform)"}}
{"rejected":{"field":"url","reason":"url: \"../../../in-a-dark-dark-wood_963/index.html\" is not an absolute URL (use the absoluteUrl transform)"}}
{"rejected":{"field":"url","reason":"url: \"../../../the-past-never-ends_942/index.html\" is not an absolute URL (use the absoluteUrl transform)"}}
```
<!-- /capture -->

<!-- capture:policy-coercion trace grep=▶|✖ -->
```text
▶ link-as-is (api)
  ✖ record rejected: url: url: "../../../sharp-objects_997/index.html" is not an absolute URL (use the absoluteUrl transform)
  ✖ record rejected: url: url: "../../../in-a-dark-dark-wood_963/index.html" is not an absolute URL (use the absoluteUrl transform)
  ✖ record rejected: url: url: "../../../the-past-never-ends_942/index.html" is not an absolute URL (use the absoluteUrl transform)
▶ link-null (api)
  ✖ step steps.2 (forEach) failed: mapping failed: url: url: "../../../sharp-objects_997/index.html" is not an absolute URL (use the absoluteUrl transform)
■ link-null: 0 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.2 (forEach) failed: mapping failed: url: url: "../../../sharp-objects_997/index.html" is not an absolute URL (use the absoluteUrl transform)
```
<!-- /capture -->

For `link-as-is`, nothing is set on the rule or the field and there is no `default`, so the output recipe's
`skip-record` applies and each book is rejected. For `link-null`, the rule says `null`, which isn't
`skip-record`, so the first book fails the mapping and the recipe stops. The fix is the `absoluteUrl`
transform, which the error message names. The field's path appears twice in these messages (`url: url: …`),
tracked in [#78](https://github.com/russoedu/open.craw/issues/78).

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
ot-integer: 0 emitted, 0 rejected, 0 duplicates, 1 pages, stopped: step steps.2 (forEach) failed: mapping failed: otLosses: transform "number": no number in ""
ot-plain: 3 emitted, 2 rejected, 0 duplicates, 1 pages
```
<!-- /capture -->

<!-- capture:policy-transform trace grep=▶|✖ -->
```text
▶ ot-integer-skip (api)
  ✖ record rejected: otLosses: transform "number": no number in ""
  ✖ record rejected: otLosses: transform "number": no number in ""
▶ ot-integer (api)
  ✖ step steps.2 (forEach) failed: mapping failed: otLosses: transform "number": no number in ""
■ ot-integer: 0 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.2 (forEach) failed: mapping failed: otLosses: transform "number": no number in ""
▶ ot-plain (api)
  ✖ record rejected: otLosses: otLosses: transform "number": no number in ""
  ✖ record rejected: otLosses: otLosses: transform "number": no number in ""
```
<!-- /capture -->

<!-- capture:policy-transform records n=5 -->
```json
{"rejected":{"field":"otLosses","reason":"transform \"number\": no number in \"\""}}
{"rejected":{"field":"otLosses","reason":"transform \"number\": no number in \"\""}}
{"team":"Boston Bruins","year":1999,"otLosses":6}
{"team":"Boston Bruins","year":2000,"otLosses":8}
{"team":"Boston Bruins","year":2001,"otLosses":9}
```
<!-- /capture -->

- `ot-integer-skip`: `integer` throws on `""` (the error names `number`, the op `integer` is built on). The
  rule says `skip-record`, so 1997 and 1998 are rejected, and 1999 to 2001 kept.
- `ot-integer`: the same error, and the rule says nothing. The output recipe's `skip-record` isn't consulted
  for a transform failure, so the first season stops the recipe.
- `ot-plain`: no transform, so no transform failure. `""` reaches coercion, which fails because an `integer`
  field doesn't take `""` ([What counts as missing](#what-counts-as-missing)). A coercion failure follows the
  full precedence, the output recipe says `skip-record`, and the two seasons are rejected. The reason carries
  the path, as coercion errors do.

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

## Two gaps (issue #78)

Two things the policies don't do today, tracked in [#78](https://github.com/russoedu/open.craw/issues/78).

**A `default` isn't coerced or validated.** It is written into the record as it is. The precedence scene's
`otLossesNote` is an `integer` field with `"default": "not recorded"`, and the text lands in it:

<!-- capture:policy-precedence record record=0 -->
```json
{
  "team": "Boston Bruins",
  "year": 1997,
  "otLosses": 0,
  "otLossesField": null,
  "otLossesRule": null,
  "otLossesNote": "not recorded"
}
```
<!-- /capture -->

Nothing warns at load time or at run time. Check that each `default` has the field's type. (A `default` policy
on a field without a `default` is the other side of it: the field is left out, without an error.)

**The objects built by `each` get no policy and no validation.** Their members are coerced, but a `required`
member that is missing passes. PokeAPI lists the abilities a Pokémon had in older generations; for Bulbasaur
the one entry has `"ability": null`, because its hidden ability didn't exist before generation V
([recipe](recipes/policy-each-gap/pokeapi-past.input.json)). The output recipe makes `name` required in each
item:

<!-- capture:policy-each-gap mapping fields=pastAbilities[0].name,pastAbilities[0].slot,pastAbilities[0].until -->
| Field | Step | Value |
|---|---|---|
| `pastAbilities[0].name` | read | *(missing)* |
| | **field** | *(missing)* |
| `pastAbilities[0].slot` | read | `3` |
| | **field** | `3` |
| `pastAbilities[0].until` | read | `"generation-iv"` |
| | **field** | `"generation-iv"` |
<!-- /capture -->

<!-- capture:policy-each-gap record -->
```json
{
  "name": "bulbasaur",
  "pastAbilities": [
    {
      "slot": 3,
      "until": "generation-iv"
    }
  ]
}
```
<!-- /capture -->

The item has no `name` and the record is emitted anyway. Until #78 is fixed, a rule inside `each.fields` has
an `onMissing` that matters only for its transform failures, and a check on the items has to happen after the
crawl.

## What's next

[Running](09-running.md): sessions, access, blocks, retries and the other things that decide whether a page
arrives at all.
