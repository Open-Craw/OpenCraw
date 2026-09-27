// Scenes for 02-page-steps.md: each page step working in a real browser. Each runs the recipes in
// ../../recipes/<name>/, keeps `keep` records, and takes each of its `screenshots`: open `url`, run `steps`
// (fill, click, wait, select), outline each `highlight` selector with its label, save the viewport or the
// `clip` element.
//
// A screenshot `click` waits for the page's load event, but only for the page it starts on. After a step that
// navigates (a login, a postback), a click on something inert (a heading, a label) waits for the new page's
// load, stylesheets included, so the outlines and labels land where the page finally puts the elements.

export const SCENES = [
  {
    name:        'page-goto',
    keep:        3,
    screenshots: [{
      url:       'https://quotes.toscrape.com/does-not-exist',
      height:    260,
      highlight: [{ selector: 'h1', label: 'extract heading: h1' }],
    }],
  },
  {
    name:        'page-login',
    keep:        3,
    screenshots: [
      {
        url:       'https://quotes.toscrape.com/login',
        steps:     [{ fill: '#username', value: 'scraper' }, { fill: '#password', value: 'practice' }],
        clip:      'form',
        highlight: [
          { selector: '#username', label: 'fill #username' },
          { selector: '#password', label: 'fill #password, then press Enter' },
          { selector: 'input[type=submit]', label: 'what Enter submits' },
        ],
      },
      {
        url:       'https://quotes.toscrape.com/login',
        steps:     [{ fill: '#username', value: 'scraper' }, { fill: '#password', value: 'practice' }, { click: 'input[type=submit]' }, { wait: "a[href='/logout']" }, { click: '.tags-box h2' }],
        height:    560,
        highlight: [
          { selector: "a[href='/logout']", label: 'wait' },
          { selector: ".quote a[href*='goodreads.com']", label: 'only shown after a login' },
        ],
      },
      {
        url:       'https://quotes.toscrape.com/login',
        steps:     [{ fill: '#username', value: 'scraper' }, { fill: '#password', value: 'practice' }, { click: 'input[type=submit]' }, { wait: 'li.next a' }, { click: '.tags-box h2' }],
        clip:      'nav',
        highlight: [{ selector: 'li.next a', label: 'click li.next a' }],
      },
    ],
  },
  {
    name:        'page-select',
    keep:        3,
    screenshots: [
      {
        url:       'https://quotes.toscrape.com/search.aspx',
        clip:      'form',
        highlight: [
          { selector: '#author', label: 'select #author (posts the form back)' },
          { selector: '#tag', label: '#tag: no options yet' },
        ],
      },
      {
        url:       'https://quotes.toscrape.com/search.aspx',
        steps:     [{ select: '#author', value: 'Albert Einstein' }, { select: '#tag', value: 'life' }, { click: 'label[for=author]' }],
        clip:      'form',
        highlight: [
          { selector: '#author', label: 'Albert Einstein, kept by the ViewState' },
          { selector: '#tag', label: "select #tag: this author's tags" },
          { selector: 'input[name=submit_button]', label: 'click' },
        ],
      },
      {
        url:       'https://quotes.toscrape.com/search.aspx',
        steps:     [{ select: '#author', value: 'Albert Einstein' }, { select: '#tag', value: 'life' }, { click: 'input[name=submit_button]' }, { wait: '.results .quote' }],
        clip:      '.results',
        highlight: [{ selector: '.results .quote', label: 'wait, then extract .results .quote (many)' }],
      },
    ],
  },
  {
    name:        'page-scroll',
    keep:        3,
    crawler:     { dedupe: 'recipe' },
    screenshots: [{
      url:       'https://quotes.toscrape.com/scroll',
      steps:     [{ wait: '.quote' }],
      height:    620,
      highlight: [{ selector: '.quote', label: 'the first ten, fetched from /api/quotes?page=1' }],
    }],
  },
  {
    name:        'page-wait',
    keep:        3,
    crawler:     { dedupe: 'recipe' },
    screenshots: [
      {
        url:       'https://quotes.toscrape.com/js-delayed/',
        height:    360,
        highlight: [{ selector: 'body > .container', label: 'at load: no .quote yet' }],
      },
      {
        url:       'https://quotes.toscrape.com/js-delayed/',
        steps:     [{ wait: '.quote' }],
        height:    500,
        highlight: [{ selector: '.quote', label: 'wait .quote: ten seconds later' }],
      },
    ],
  },
  {
    name:        'page-evaluate',
    keep:        3,
    screenshots: [{
      url:       'https://quotes.toscrape.com/js/',
      height:    500,
      highlight: [{ selector: '.quote', label: 'written by the page from its var data' }],
    }],
  },
  {
    name:        'page-download',
    keep:        3,
    screenshots: [{
      url:       'https://quotes.toscrape.com/',
      height:    420,
      highlight: [
        { selector: '.header-box p', label: 'link' },
        { selector: '.quote', label: 'the rows it writes to the CSV' },
      ],
    }],
  },
]
