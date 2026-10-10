/** The flags that name a hooks or plugins module, as for `opencraw studio` (`--hooks` is the short name, `--plugins` the long one). */
export const HOOKS_FLAGS: readonly string[] = ['--hooks', '--plugins']

/**
 * The hooks or plugins file named at launch, as in `studio-desktop --hooks hooks.mjs <folder>`.
 *
 * @param argv - `process.argv`.
 * @param packaged - Whether the app is a packaged build (see `folderArgument`).
 * @param env - The environment; `OPENCRAW_PLUGINS` or `OPENCRAW_HOOKS` name the file when no flag does, as for the CLI.
 * @returns The file as written (the caller resolves it against the working directory), or `undefined`.
 */
export function hooksArgument (argv: readonly string[], packaged: boolean, env: Readonly<Record<string, string | undefined>> = {}): string | undefined {
  const args = argv.slice(packaged ? 1 : 2)
  for (const [index, argument] of args.entries()) {
    const flag = HOOKS_FLAGS.find(candidate => argument === candidate || argument.startsWith(`${candidate}=`))
    if (flag === undefined) continue
    const value = argument === flag ? args[index + 1] : argument.slice(flag.length + 1)
    if (value !== undefined && value !== '') return value
  }
  const fromEnv = env.OPENCRAW_PLUGINS ?? env.OPENCRAW_HOOKS

  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv
}
