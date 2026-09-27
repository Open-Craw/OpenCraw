// Scenes for parts 4 and 5 of the guide: data steps (03-data-steps.md) and flow steps (04-flow-steps.md).
// Each runs the recipes in ../../recipes/<name>/, keeps `keep` records, and takes each of its `screenshots`:
// open `url`, run `steps`, outline each `highlight` selector with its label, save the viewport or the `clip`
// element. Every scene is small: a page or two of a practice site or a public API, with `delayMs` of 300.

/** The hook the `hook` step of data-api-quotes calls: the words in a text. */
const wordCount = (_input, args) => String(args.text ?? '').split(/\s+/).filter(Boolean).length

export const SCENES = [
  // 03-data-steps.md
  {
    name:        'data-quotes-web',
    keep:        2,
    screenshots: [{
      url:       'https://quotes.toscrape.com/page/1/',
      clip:      'div.container',
      maxHeight: 560,
      highlight: [
        { selector: 'div.quote', label: 'quotes: div.quote (many, take html)' },
        { selector: 'div.quote span.text', label: 'text: span.text' },
        { selector: 'div.quote small.author', label: 'author: //small[@class=\'author\']' },
        { selector: 'div.tags-box a.tag', label: 'topTags' },
      ],
    }],
  },
  { name: 'data-api-quotes', keep: 2, crawler: { hooks: { wordCount } } },
  {
    name:        'data-regex-js',
    keep:        2,
    screenshots: [{
      url:       'https://quotes.toscrape.com/js/',
      clip:      'div.container',
      maxHeight: 420,
      highlight: [{ selector: 'div.quote', label: 'div.quote: written by a script, so only a browser sees it' }],
    }],
  },
  {
    name:        'data-table',
    keep:        5,
    screenshots: [{
      url:       'https://www.scrapethissite.com/pages/forms/?per_page=5',
      clip:      'table.table',
      highlight: [
        { selector: 'table.table tr:first-child', label: 'header row: ^Team Name' },
        { selector: 'table.table tr.team', label: 'rows' },
      ],
    }],
  },
  {
    name:        'data-fragments',
    keep:        7,
    screenshots: [{
      url:       'https://books.toscrape.com/catalogue/sharp-objects_997/index.html',
      clip:      'table.table-striped',
      highlight: [
        { selector: 'table.table-striped tr' },
        { selector: 'table.table-striped th', label: 'name: th, in each row' },
        { selector: 'table.table-striped td', label: 'value: td' },
      ],
    }],
  },
  {
    name:        'data-wrapper-trap',
    keep:        2,
    screenshots: [{
      url:       'https://www.scrapethissite.com/pages/simple/',
      clip:      'section#countries',
      maxHeight: 620,
      highlight: [
        { selector: 'div.row:has(div.country)', label: 'rows: div.row:has(div.country), a wrapper of three' },
      ],
    }],
  },
  { name: 'data-request', keep: 3 },
  {
    name:        'data-form',
    keep:        1,
    screenshots: [{
      url:       'https://quotes.toscrape.com/login',
      clip:      'div.container',
      maxHeight: 420,
      highlight: [
        { selector: 'form', label: 'form: { selector: "form" }, read with FormData' },
        { selector: 'div.header-box p a', label: 'liveLink' },
      ],
    }],
  },

  // 04-flow-steps.md
  { name: 'flow-foreach', keep: 3 },
  { name: 'flow-concurrency', keep: 6 },
  {
    name:        'flow-paginate-click',
    keep:        3,
    screenshots: [{
      url:       'https://books.toscrape.com/catalogue/page-1.html',
      clip:      'ul.pager',
      highlight: [
        { selector: 'li.next a', label: 'next' },
        { selector: 'li.current', label: 'pager: li.current' },
      ],
    }],
  },
  { name: 'flow-paginate-url', keep: 3 },
  { name: 'flow-paginate-cursor', keep: 8 },
  { name: 'flow-accumulate', keep: 1 },
  { name: 'flow-if', keep: 10 },
  { name: 'flow-onerror-skip', keep: 10 },
  { name: 'flow-onerror-trap', keep: 10 },
  { name: 'flow-onerror-retry', keep: 1 },
  { name: 'flow-maxrecords', keep: 5 },
]
