/** What to ask Studio to open: the path, and the workspace folder it belongs to when it sits inside one. */
export interface OpenTarget {
  open:       string
  workspace?: string
}

/** A path with `\` as `/` and no trailing separator, for comparing; the original spelling is what is sent. */
function comparable (path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/u, '')
}

/**
 * The target for a file or folder picked in the editor: the path itself, and
 * the editor's workspace folder that holds it (the deepest one, when
 * workspace folders are nested). A path outside every workspace folder has no
 * workspace: Studio then uses the file's own folder.
 *
 * Drive letters compare case-insensitively, as VS Code reports `c:` and `C:`
 * for the same folder.
 *
 * @param path - The picked file or folder, as the file system path.
 * @param workspaceFolders - The editor's workspace folders, as file system paths.
 * @returns The target.
 */
export function openTargetFor (path: string, workspaceFolders: readonly string[]): OpenTarget {
  const wanted = comparable(path).toLowerCase()
  let best: string | undefined
  for (const folder of workspaceFolders) {
    const candidate = comparable(folder).toLowerCase()
    const inside = wanted === candidate || wanted.startsWith(`${candidate}/`)
    if (inside && (best === undefined || candidate.length > comparable(best).length)) best = folder
  }

  return best === undefined ? { open: path } : { open: path, workspace: best }
}
