/**
 * @param serverUrl - The Studio server's URL, token included (`http://127.0.0.1:<port>/?token=…`).
 * @param folder - The recipe folder to open, if any. The UI reads it from the `folder` query parameter.
 * @returns The URL the window loads: the server's, with `folder` set or removed.
 */
export function windowUrl (serverUrl: string, folder: string | undefined): string {
  const url = new URL(serverUrl)
  if (folder === undefined) url.searchParams.delete('folder')
  else url.searchParams.set('folder', folder)

  return url.href
}
