// Scenes for one page of the guide. Each runs the recipes in ../../recipes/<name>/ (or `recipes`), keeps
// `keep` records, and takes each of its `screenshots`: open `url`, run `steps` (fill, click, wait, select),
// outline each `highlight` selector with its label, save the viewport or the `clip` element. A screenshot
// with `pdf` instead renders that PDF's page with every cell readPdf found drawn on it.

export const SCENES = [
  {
    name:        'pdf-discounts',
    keep:        4,
    screenshots: [{ pdf: 'https://www.enpam.it/wp-content/uploads/STELLANTIS-SCONTI-e-cod-promo_mese-09-2026.pdf', page: 1, header: '^MODELLI' }],
  },
]
