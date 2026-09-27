// The scenes the how-it-works guide shows. Each runs the recipes in ../recipes/<name>/ (or `recipes`),
// keeps `keep` records, and takes each of its `screenshots`: open `url`, run `steps`, outline each
// `highlight` selector with its label, save the viewport or the `clip` element.

export const SCENES = [
  {
    name:        'books-list',
    keep:        3,
    screenshots: [{
      url:       'https://books.toscrape.com/catalogue/category/books/mystery_3/index.html',
      clip:      'ol.row',
      maxHeight: 520,
      highlight: [
        { selector: 'article.product_pod', label: 'books: article.product_pod (many)' },
        { selector: 'article.product_pod h3 a', label: 'title / link: h3 a' },
        { selector: 'article.product_pod .price_color', label: 'price' },
        { selector: 'article.product_pod p.star-rating', label: 'rating: class' },
      ],
    }],
  },
  {
    name:        'pdf-discounts',
    keep:        4,
    screenshots: [{ pdf: 'https://www.enpam.it/wp-content/uploads/STELLANTIS-SCONTI-e-cod-promo_mese-09-2026.pdf', page: 1, header: '^MODELLI' }],
  },
]
