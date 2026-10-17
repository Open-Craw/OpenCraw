import monosmith from '@monosmith/eslint-config'

export default [
  ...monosmith({ verticalSlices: ['packages/*/src/**/*.ts'] }),
  { name: 'local/test-fixtures-are-data', ignores: ['packages/*/src/**/fixtures/**/*.{html,json,txt}'] },
  {
    name:  'local/contract-regexes-are-flag-free',
    files: ['packages/*/src/**/*.contract.ts'],
    rules: {
      'regexp/use-ignore-case': 'off',
      'no-restricted-syntax':   ['error', {
        selector: 'Literal[regex.flags=/./]',
        message:  'A contract regex becomes a JSON Schema pattern, which keeps no flags: write it without one (for example [A-Za-z] instead of the i flag).',
      }],
    },
  },
  {
    ignores: [
      '**/vite.config.*.timestamp*',
      '.claude/worktrees/**',
      // The desktop app's packaging output: a staged copy of dependencies and the unpacked app.
      'apps/studio-desktop/dist-app/**',
      'apps/studio-desktop/release/**',
      'apps/vscode-extension/dist-vsix/**',
      'apps/vscode-extension/.vscode-test/**',
      // Runs once to make the tutorial's pictures and video: it drives a browser page (code that runs in the page is a string of the page's own globals).
      'docs/studio/capture/**',
      // Written by smith (convert, ci generate), which do not pass this config yet: monosmith-app/monosmith#286.
      '.devcontainer/devcontainer.json',
      'declaration-specifiers.mjs',
      'jest.asset-transform.cjs',
      'jest.preset.js',
      // Local only, never committed: field-test scratch (gitignored) and the browser tool's snapshots.
      'studio-field-tests/**',
      '.playwright-mcp/**',
    ],
  },
]
