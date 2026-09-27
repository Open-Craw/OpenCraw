// Scenes for pages 2 (recipes) and 6 (templates and scope) of the guide. Each runs the recipes in
// ../../recipes/<name>/ (or `recipes`), keeps `keep` records, and takes each of its `screenshots`: open `url`,
// run `steps` (fill, click, wait, select), outline each `highlight` selector with its label, save the viewport or
// the `clip` element. `crawler` is merged into the crawler's options.

const ATTIC = 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html'

export const SCENES = [
  {
    name:        'recipes-types',
    keep:        1,
    screenshots: [{
      url:       ATTIC,
      clip:      'article.product_page',
      maxHeight: 1250,
      highlight: [
        { selector: '.product_main h1', label: 'title' },
        { selector: '.product_main .price_color', label: 'price' },
        { selector: '.product_main .availability', label: 'stock' },
        { selector: 'table.table-striped', label: 'upc, productType, excl, incl, tax, reviews, rows' },
      ],
    }],
  },
  { name: 'recipes-number', keep: 7 },
  { name: 'recipes-rejects', keep: 6 },
  {
    name:        'recipes-web-vs-api',
    keep:        21,
    crawler:     { dedupe: 'off' },
    screenshots: [{
      url:       'https://quotes.toscrape.com/js/',
      clip:      'div.quote',
      highlight: [
        { selector: 'div.quote', label: 'quotes: div.quote (many)' },
        { selector: 'div.quote span.text', label: 'text' },
        { selector: 'div.quote small.author', label: 'author' },
        { selector: 'div.quote a.tag', label: 'tags (many)' },
      ],
    }],
  },
  { name: 'recipes-dedupe', recipes: 'recipes-web-vs-api', keep: 1 },
  {
    name:        'recipes-session',
    keep:        3,
    screenshots: [{
      url:       'https://quotes.toscrape.com/login',
      steps:     [{ fill: '#username', value: 'reader' }, { fill: '#password', value: 'any-password-works-here' }, { click: 'input[type=submit]' }, { wait: "a[href='/logout']" }],
      height:    520,
      highlight: [
        { selector: "a[href='/logout']" },
        { selector: "div.quote a[href*='goodreads.com']" },
      ],
    }],
  },
  { name: 'scope-chain', keep: 12 },
  { name: 'scope-templates', keep: 1 },
]
