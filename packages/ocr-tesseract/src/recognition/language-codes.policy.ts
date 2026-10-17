/** The Tesseract code of each two-letter language code a recipe may use, for the languages with a model people ask for. */
const TESSERACT_CODES: Readonly<Record<string, string>> = {
  ar: 'ara',
  bg: 'bul',
  ca: 'cat',
  cs: 'ces',
  da: 'dan',
  de: 'deu',
  el: 'ell',
  en: 'eng',
  es: 'spa',
  et: 'est',
  fi: 'fin',
  fr: 'fra',
  he: 'heb',
  hi: 'hin',
  hr: 'hrv',
  hu: 'hun',
  id: 'ind',
  it: 'ita',
  ja: 'jpn',
  ko: 'kor',
  lt: 'lit',
  lv: 'lav',
  nb: 'nor',
  nl: 'nld',
  no: 'nor',
  pl: 'pol',
  pt: 'por',
  ro: 'ron',
  ru: 'rus',
  sk: 'slk',
  sl: 'slv',
  sv: 'swe',
  th: 'tha',
  tr: 'tur',
  uk: 'ukr',
  vi: 'vie',
  zh: 'chi_sim',
}

/** The language a page is read in when nothing says. */
export const DEFAULT_LANGUAGE = 'eng'

/**
 * The Tesseract languages for the ones asked for: two-letter codes (`it`, `pt`) become Tesseract's (`ita`, `por`), Tesseract's own are kept
 * (`eng`, `chi_sim`, `por+eng` as two), lower-cased and without repeats. English when none is asked for.
 *
 * @param languages - The languages, as a recipe wrote them.
 * @returns The Tesseract codes, in the order asked for.
 */
export function tesseractLanguages (languages: readonly string[]): string[] {
  const codes = languages.flatMap(language => language.toLowerCase().split('+')).map(code => code.trim()).filter(code => code !== '').map(code => TESSERACT_CODES[code] ?? code)
  const unique = [...new Set(codes)]

  return unique.length === 0 ? [DEFAULT_LANGUAGE] : unique
}
