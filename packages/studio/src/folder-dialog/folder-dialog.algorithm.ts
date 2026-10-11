/** One way to open a folder dialog: a program and its arguments. */
export interface DialogCommand {
  file: string
  args: string[]
}

const TITLE = 'Choose the recipe folder'

/** PowerShell's own Windows Forms dialog: the only folder picker every Windows install has. UTF-8 out, so a path with accents survives the pipe. */
const WINDOWS_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
  `$dialog.Description = '${TITLE}'`,
  '$dialog.ShowNewFolderButton = $true',
  "if ($dialog.ShowDialog() -eq 'OK') { [Console]::Out.Write($dialog.SelectedPath) }",
].join('; ')

/**
 * The programs that can open a folder dialog on a platform, in the order to
 * try them: the first one installed is used. Windows and macOS have one each
 * in every install; Linux has whichever of `zenity` (GNOME and most others)
 * and `kdialog` (KDE) the desktop ships.
 *
 * @param platform - `process.platform`.
 * @returns The candidates; empty for a platform with no known dialog.
 */
export function folderDialogCommands (platform: NodeJS.Platform): DialogCommand[] {
  switch (platform) {
    case 'win32': {
      return [{ file: 'powershell.exe', args: ['-NoProfile', '-STA', '-NonInteractive', '-Command', WINDOWS_SCRIPT] }]
    }
    case 'darwin': {
      return [{ file: 'osascript', args: ['-e', `POSIX path of (choose folder with prompt "${TITLE}")`] }]
    }
    case 'linux':
    case 'freebsd':
    case 'openbsd': {
      return [
        { file: 'zenity', args: ['--file-selection', '--directory', `--title=${TITLE}`] },
        { file: 'kdialog', args: ['--getexistingdirectory', '.', '--title', TITLE] },
      ]
    }
    default: { return [] }
  }
}

/**
 * The folder a dialog printed: its output without the line break and the
 * trailing separator (`osascript` ends a folder with `/`), a root kept as it
 * is. Nothing printed means the person cancelled.
 *
 * @param output - What the dialog program wrote to its standard output.
 * @returns The folder path, or `undefined` for a cancelled dialog.
 */
export function folderFromDialogOutput (output: string): string | undefined {
  const line = output.trim()
  if (line === '') return undefined
  const withoutSeparator = line.replace(/[/\\]+$/u, '')

  return withoutSeparator === '' || /^[A-Za-z]:$/u.test(withoutSeparator) ? line : withoutSeparator
}
