// Scenes for the mapping and policies pages of the guide (07-mapping-and-transforms.md, 08-policies.md).
// Each runs the recipes in ../../recipes/<name>/, keeps `keep` records, and, with `crawler`, passes
// options such as hooks to createCrawler. None takes a screenshot: these pages show values, not pages.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * The hook the authors scene calls: quotes.toscrape.com writes birth dates as "March 14, 1879", and the
 * `date` transform reads only numeric formats, so this turns the text into "1879-03-14" first.
 */
function monthDayYear (input) {
  const match = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(String(input).trim())
  const month = match === null ? 0 : MONTHS.indexOf(match[1]) + 1
  if (month === 0) throw new Error(`not a "Month D, YYYY" date: ${String(input)}`)

  return `${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`
}

export const SCENES = [
  { name: 'map-books-detail', keep: 3 },
  { name: 'map-quotes-api', keep: 10 },
  { name: 'map-quotes-authors', keep: 3, crawler: { hooks: { monthDayYear } } },
  { name: 'map-pokeapi', keep: 2 },
  { name: 'map-hockey-numbers', keep: 3 },
  { name: 'policy-precedence', keep: 5 },
  { name: 'policy-transform', keep: 10 },
  { name: 'policy-coercion', keep: 3 },
  { name: 'policy-quotes', keep: 10 },
  { name: 'policy-each-gap', keep: 1 },
]
