import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Whether a URL is a `file:` URL with a relative path: `file:data/listino.csv`,
 * `file:./x.pdf`, `file:../shared/x.xlsx`. `file:/…`, `file:///…` and a
 * Windows drive (`file:C:/…`) are absolute.
 *
 * @param url - A URL as a recipe writes it.
 * @returns Whether its path is relative.
 */
export function isRelativeFileUrl (url: string): boolean {
  return /^file:(?![/\\]|[a-z]:)/i.test(url)
}

/**
 * Resolves a relative `file:` URL against a folder: the recipe file's, or the
 * working directory. Any other URL is returned as it is. A template in the path
 * (`file:data/{{ name }}.csv`) is kept as written: only the text before the
 * first `{{` is resolved, and the rest renders later.
 *
 * @param url - A URL as a recipe writes it.
 * @param folder - An absolute folder path.
 * @returns An absolute `file:` URL, or `url`.
 */
export function resolveFileUrl (url: string, folder: string): string {
  if (!isRelativeFileUrl(url)) return url
  const path = url.slice('file:'.length)
  const template = path.indexOf('{{')
  const head = template === -1 ? path : path.slice(0, template)

  return new URL(head, pathToFileURL(join(folder, '/'))).href + path.slice(head.length)
}

/**
 * Resolves the URL a `request` or `goto` names: a relative `file:` URL against
 * `folder`, any other relative URL against the current page, the way a browser
 * resolves a link.
 *
 * @param target - The rendered URL.
 * @param base - The current page's URL, if any.
 * @param folder - What a relative `file:` URL resolves against: the working directory.
 * @returns An absolute URL.
 * @throws Error saying why when `target` is not a URL and there is no page to resolve it against.
 */
export function resolveRequestUrl (target: string, base: string | undefined, folder: string): string {
  if (isRelativeFileUrl(target)) return resolveFileUrl(target, folder)
  if (URL.canParse(target)) return new URL(target).href
  const page = base === undefined ? undefined : resolveFileUrl(base, folder)
  if (page === undefined || page === 'about:blank' || !URL.canParse(page)) {
    throw new Error(`"${target}" is not an absolute URL, and there is no page to resolve it against: give a full URL (https://…), or a file: URL for a local file`)
  }
  try {
    return new URL(target, page).href
  } catch {
    throw new Error(`"${target}" is not a URL and cannot be resolved against ${page}`)
  }
}
