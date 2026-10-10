/**
 * The recipe folder named on the command line, as in `studio-desktop <folder>`.
 *
 * @param argv - `process.argv`.
 * @param packaged - Whether the app is a packaged build. Unpackaged, Electron's argv holds the app path
 *   before the arguments (`electron <app> <folder>`); packaged, only the executable comes first.
 * @returns The first argument that is not a flag, or `undefined`.
 */
export function folderArgument (argv: readonly string[], packaged: boolean): string | undefined {
  return argv.slice(packaged ? 1 : 2).find(argument => !argument.startsWith('-'))
}
