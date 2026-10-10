import { HOOKS_FLAGS } from './hooks-argument.algorithm'

/**
 * The recipe folder named on the command line, as in `studio-desktop <folder>`.
 *
 * @param argv - `process.argv`.
 * @param packaged - Whether the app is a packaged build. Unpackaged, Electron's argv holds the app path
 *   before the arguments (`electron <app> <folder>`); packaged, only the executable comes first.
 * @returns The first argument that is not a flag or a flag's value (`--hooks <file>`), or `undefined`.
 */
export function folderArgument (argv: readonly string[], packaged: boolean): string | undefined {
  const args = argv.slice(packaged ? 1 : 2)
  for (let index = 0; index < args.length; index++) {
    const argument = args[index] ?? ''
    if (HOOKS_FLAGS.includes(argument)) index++
    else if (!argument.startsWith('-')) return argument
  }

  return undefined
}
